from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import PaymentClaim, Institution, User
from app.schemas import PaymentClaimCreate, PaymentClaimOut, OfficerDecisionRequest
from app.security import get_current_user, require_roles, enforce_institution_or_region_access
from app.services.matching_engine import verify_payment_claim
from app.services.audit_service import log_audit
from app.services.rules_engine import calculate_deposit_requirement

router = APIRouter(prefix="/claims", tags=["Payment Claims & Verification"])

@router.get("", response_model=List[PaymentClaimOut])
def list_claims(
    status_filter: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = db.query(PaymentClaim).join(Institution)

    if current_user.role == "institution":
        if current_user.institution_id:
            query = query.filter(PaymentClaim.institution_id == current_user.institution_id)
        else:
            return []
    elif current_user.role == "scrutiny":
        if current_user.region_scope:
            query = query.filter(Institution.region == current_user.region_scope)

    if status_filter:
        query = query.filter(PaymentClaim.officer_decision == status_filter)

    claims = query.order_by(PaymentClaim.created_at.desc()).all()

    result = []
    for c in claims:
        # Run or load match result
        if not c.match_result:
            verify_payment_claim(db, c)
            db.refresh(c)

        out = PaymentClaimOut.model_validate(c)
        out.institution_name = c.institution.name if c.institution else None

        req_dep = calculate_deposit_requirement(c.institution)["required_deposit"] if c.institution else 0.0
        out.required_deposit = req_dep
        out.shortfall = max(0.0, req_dep - c.amount)
        result.append(out)

    return result

@router.post("", response_model=PaymentClaimOut, status_code=status.HTTP_201_CREATED)
def submit_payment_claim(
    payload: PaymentClaimCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    inst = db.query(Institution).filter(Institution.id == payload.institution_id).first()
    if not inst:
        raise HTTPException(status_code=404, detail="Institution not found")
    enforce_institution_or_region_access(current_user, inst)

    new_claim = PaymentClaim(
        institution_id=payload.institution_id,
        utr=payload.utr.strip(),
        amount=payload.amount,
        date=payload.date,
        provenance_tag="INSTITUTION_SUBMITTED",
        officer_decision="PENDING",
        remarks=payload.remarks
    )
    db.add(new_claim)
    db.flush()

    # Automatically run verification engine
    match_res = verify_payment_claim(db, new_claim)

    log_audit(
        db=db,
        actor_id=current_user.id,
        actor_name=current_user.full_name,
        actor_role=current_user.role,
        action=f"Submitted payment claim UTR {new_claim.utr} for {inst.name} (Match Result: {match_res.classification})",
        entity_type="PaymentClaim",
        entity_id=new_claim.id,
        after_state={"utr": new_claim.utr, "amount": new_claim.amount, "match": match_res.classification}
    )
    db.commit()
    db.refresh(new_claim)

    out = PaymentClaimOut.model_validate(new_claim)
    out.institution_name = inst.name
    req_dep = calculate_deposit_requirement(inst)["required_deposit"]
    out.required_deposit = req_dep
    out.shortfall = max(0.0, req_dep - new_claim.amount)
    return out

@router.post("/{id}/verify", response_model=PaymentClaimOut)
def run_verification(
    id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    claim = db.query(PaymentClaim).filter(PaymentClaim.id == id).first()
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")
    enforce_institution_or_region_access(current_user, claim.institution)

    match_res = verify_payment_claim(db, claim)
    db.commit()
    db.refresh(claim)

    out = PaymentClaimOut.model_validate(claim)
    out.institution_name = claim.institution.name if claim.institution else None
    req_dep = calculate_deposit_requirement(claim.institution)["required_deposit"] if claim.institution else 0.0
    out.required_deposit = req_dep
    out.shortfall = max(0.0, req_dep - claim.amount)
    return out

@router.post("/{id}/officer-verify", response_model=PaymentClaimOut)
def officer_verify_claim(
    id: str,
    req: OfficerDecisionRequest,
    current_user: User = Depends(require_roles("admin", "head", "scrutiny")),
    db: Session = Depends(get_db)
):
    claim = db.query(PaymentClaim).filter(PaymentClaim.id == id).first()
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")
    enforce_institution_or_region_access(current_user, claim.institution)

    # Recheck match state
    match_res = claim.match_result or verify_payment_claim(db, claim)
    if match_res.classification != "EXACT_MATCH":
        raise HTTPException(
            status_code=400,
            detail=f"Cannot mark officer-verified: Transaction is not an EXACT_MATCH (current: {match_res.classification}). Only statement-matched transactions can be verified."
        )

    before_state = {"officer_decision": claim.officer_decision}
    claim.officer_decision = "OFFICER_VERIFIED"
    claim.decided_by = f"{current_user.full_name} ({current_user.role})"
    claim.decided_at = datetime.now(timezone.utc)
    if req.notes:
        claim.remarks = req.notes

    log_audit(
        db=db,
        actor_id=current_user.id,
        actor_name=current_user.full_name,
        actor_role=current_user.role,
        action=f"Scrutiny Officer marked claim UTR {claim.utr} as OFFICER_VERIFIED for {claim.institution.name}",
        entity_type="PaymentClaim",
        entity_id=claim.id,
        before_state=before_state,
        after_state={"officer_decision": "OFFICER_VERIFIED", "decided_by": claim.decided_by, "notes": req.notes}
    )
    db.commit()
    db.refresh(claim)

    out = PaymentClaimOut.model_validate(claim)
    out.institution_name = claim.institution.name if claim.institution else None
    return out

@router.post("/{id}/clarify", response_model=PaymentClaimOut)
def request_clarification_on_claim(
    id: str,
    req: OfficerDecisionRequest,
    current_user: User = Depends(require_roles("admin", "head", "scrutiny")),
    db: Session = Depends(get_db)
):
    claim = db.query(PaymentClaim).filter(PaymentClaim.id == id).first()
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")
    enforce_institution_or_region_access(current_user, claim.institution)

    before_state = {"officer_decision": claim.officer_decision}
    claim.officer_decision = "CLARIFICATION_REQUESTED"
    claim.decided_by = f"{current_user.full_name} ({current_user.role})"
    claim.decided_at = datetime.now(timezone.utc)
    if req.notes:
        claim.remarks = req.notes

    log_audit(
        db=db,
        actor_id=current_user.id,
        actor_name=current_user.full_name,
        actor_role=current_user.role,
        action=f"Scrutiny Officer requested clarification on claim UTR {claim.utr} for {claim.institution.name}",
        entity_type="PaymentClaim",
        entity_id=claim.id,
        before_state=before_state,
        after_state={"officer_decision": "CLARIFICATION_REQUESTED", "decided_by": claim.decided_by, "notes": req.notes}
    )
    db.commit()
    db.refresh(claim)

    out = PaymentClaimOut.model_validate(claim)
    out.institution_name = claim.institution.name if claim.institution else None
    return out
