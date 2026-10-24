from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import ReleaseRequest, WorkflowStep, Deduction, Instrument, Institution, User
from app.schemas import ReleaseRequestCreate, ReleaseRequestOut, WorkflowActionRequest, DeductionCreate, DeductionOut
from app.security import get_current_user, require_roles, enforce_institution_or_region_access
from app.services.audit_service import log_audit
from app.services.notification_service import render_and_send_mail
from app.services.rules_engine import format_currency

router = APIRouter(prefix="", tags=["Release Workflow & Deductions"])

@router.get("/release-requests", response_model=List[ReleaseRequestOut])
def list_release_requests(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = db.query(ReleaseRequest).join(Institution)

    if current_user.role == "institution":
        if current_user.institution_id:
            query = query.filter(ReleaseRequest.institution_id == current_user.institution_id)
        else:
            return []
    elif current_user.role == "scrutiny":
        if current_user.region_scope:
            query = query.filter(Institution.region == current_user.region_scope)

    requests = query.order_by(ReleaseRequest.created_at.desc()).all()
    res = []
    for r in requests:
        out = ReleaseRequestOut.model_validate(r)
        out.institution_name = r.institution.name if r.institution else None
        out.instrument_ref = r.instrument.reference if r.instrument else None
        res.append(out)
    return res

@router.post("/release-requests", response_model=ReleaseRequestOut, status_code=status.HTTP_201_CREATED)
def submit_release_request(
    payload: ReleaseRequestCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    inst = db.query(Institution).filter(Institution.id == payload.institution_id).first()
    if not inst:
        raise HTTPException(status_code=404, detail="Institution not found")
    enforce_institution_or_region_access(current_user, inst)

    instr = db.query(Instrument).filter(Instrument.id == payload.instrument_id).first()
    if not instr:
        raise HTTPException(status_code=404, detail="Instrument not found")

    # Punitive action check
    is_blocked = bool(inst.punitive_flag)

    req = ReleaseRequest(
        institution_id=payload.institution_id,
        instrument_id=payload.instrument_id,
        reason=payload.reason,
        status="SUBMITTED",
        has_request_letter=payload.has_request_letter,
        has_affidavit_6=payload.has_affidavit_6,
        punitive_blocked=is_blocked
    )
    db.add(req)
    db.flush()

    # Create submission workflow step
    step = WorkflowStep(
        request_id=req.id,
        step_name="SUBMISSION",
        actor_id=current_user.id,
        actor_name=current_user.full_name,
        actor_role=current_user.role,
        decision="SUBMITTED",
        notes=payload.reason
    )
    db.add(step)
    db.flush()

    log_audit(
        db=db,
        actor_id=current_user.id,
        actor_name=current_user.full_name,
        actor_role=current_user.role,
        action=f"Filed release request for instrument {instr.reference} ({inst.name})",
        entity_type="ReleaseRequest",
        entity_id=req.id,
        after_state={"punitive_blocked": is_blocked, "has_affidavit_6": payload.has_affidavit_6}
    )
    db.commit()
    db.refresh(req)

    out = ReleaseRequestOut.model_validate(req)
    out.institution_name = inst.name
    out.instrument_ref = instr.reference
    return out

@router.post("/release-requests/{id}/recommend", response_model=ReleaseRequestOut)
def committee_recommend_release(
    id: str,
    action: WorkflowActionRequest,
    current_user: User = Depends(require_roles("admin", "head", "committee", "scrutiny")),
    db: Session = Depends(get_db)
):
    req = db.query(ReleaseRequest).filter(ReleaseRequest.id == id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Release request not found")

    if req.punitive_blocked:
        raise HTTPException(status_code=400, detail="Cannot recommend: Institution is currently under punitive action.")

    if not req.has_request_letter or not req.has_affidavit_6:
        raise HTTPException(status_code=400, detail="Completeness check failed: Both Request Letter and Affidavit 6 are mandatory.")

    before_state = {"status": req.status}
    req.status = "RECOMMENDED"

    step = WorkflowStep(
        request_id=req.id,
        step_name="COMMITTEE_RECOMMENDATION",
        actor_id=current_user.id,
        actor_name=current_user.full_name,
        actor_role=current_user.role,
        decision="RECOMMENDED",
        notes=action.notes or "Committee recommended for competent authority approval"
    )
    db.add(step)

    log_audit(
        db=db,
        actor_id=current_user.id,
        actor_name=current_user.full_name,
        actor_role=current_user.role,
        action=f"Committee recommended release request {req.id} for {req.institution.name}",
        entity_type="ReleaseRequest",
        entity_id=req.id,
        before_state=before_state,
        after_state={"status": "RECOMMENDED", "notes": action.notes}
    )
    db.commit()
    db.refresh(req)

    out = ReleaseRequestOut.model_validate(req)
    out.institution_name = req.institution.name if req.institution else None
    out.instrument_ref = req.instrument.reference if req.instrument else None
    return out

@router.post("/release-requests/{id}/authorise", response_model=ReleaseRequestOut)
def competent_authority_authorise_release(
    id: str,
    action: WorkflowActionRequest,
    current_user: User = Depends(require_roles("admin", "head")),
    db: Session = Depends(get_db)
):
    req = db.query(ReleaseRequest).filter(ReleaseRequest.id == id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Release request not found")

    if req.punitive_blocked:
        raise HTTPException(status_code=400, detail="Cannot authorise: Institution is under punitive action.")

    speaking_order = action.speaking_order_ref or f"AICTE/RB/SO/{req.id[:8].upper()}"
    before_state = {"status": req.status}
    req.status = "AUTHORISED"
    req.speaking_order_ref = speaking_order

    # Update instrument status to released
    if req.instrument:
        req.instrument.status = "released"

    step = WorkflowStep(
        request_id=req.id,
        step_name="AUTHORISATION",
        actor_id=current_user.id,
        actor_name=current_user.full_name,
        actor_role=current_user.role,
        decision="AUTHORISED",
        notes=f"Authorized under speaking order {speaking_order}. {action.notes or ''}"
    )
    db.add(step)
    db.flush()

    # Automatically render and queue release approved email
    try:
        render_and_send_mail(
            db=db,
            recipient=req.institution.registered_email,
            recipient_role="Institution",
            template_key="RELEASE_APPROVED",
            sent_by_user_id=current_user.id,
            sent_by_name=current_user.full_name,
            context={
                "institution_name": req.institution.name,
                "institution_id": req.institution.id,
                "reference": req.instrument.reference if req.instrument else "FDR",
                "bank": req.instrument.bank if req.instrument else "Designated Bank",
                "amount": format_currency(req.instrument.amount) if req.instrument else "₹0",
                "speaking_order_ref": speaking_order,
                "decision_date": step.created_at.strftime("%d-%m-%Y")
            }
        )
    except Exception:
        pass

    log_audit(
        db=db,
        actor_id=current_user.id,
        actor_name=current_user.full_name,
        actor_role=current_user.role,
        action=f"Competent Authority AUTHORISED release of FDR {req.instrument.reference if req.instrument else ''} for {req.institution.name}",
        entity_type="ReleaseRequest",
        entity_id=req.id,
        before_state=before_state,
        after_state={"status": "AUTHORISED", "speaking_order": speaking_order}
    )
    db.commit()
    db.refresh(req)

    out = ReleaseRequestOut.model_validate(req)
    out.institution_name = req.institution.name if req.institution else None
    out.instrument_ref = req.instrument.reference if req.instrument else None
    return out

@router.post("/release-requests/{id}/reject", response_model=ReleaseRequestOut)
def reject_release_request(
    id: str,
    action: WorkflowActionRequest,
    current_user: User = Depends(require_roles("admin", "head")),
    db: Session = Depends(get_db)
):
    req = db.query(ReleaseRequest).filter(ReleaseRequest.id == id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Release request not found")

    before_state = {"status": req.status}
    req.status = "REJECTED"

    step = WorkflowStep(
        request_id=req.id,
        step_name="REJECTION",
        actor_id=current_user.id,
        actor_name=current_user.full_name,
        actor_role=current_user.role,
        decision="REJECTED",
        notes=action.notes or "Rejected by Competent Authority"
    )
    db.add(step)

    log_audit(
        db=db,
        actor_id=current_user.id,
        actor_name=current_user.full_name,
        actor_role=current_user.role,
        action=f"Competent Authority REJECTED release request {req.id} for {req.institution.name}",
        entity_type="ReleaseRequest",
        entity_id=req.id,
        before_state=before_state,
        after_state={"status": "REJECTED", "notes": action.notes}
    )
    db.commit()
    db.refresh(req)

    out = ReleaseRequestOut.model_validate(req)
    out.institution_name = req.institution.name if req.institution else None
    out.instrument_ref = req.instrument.reference if req.instrument else None
    return out

# Deductions
@router.post("/deductions", response_model=DeductionOut, status_code=status.HTTP_201_CREATED)
def record_deduction(
    payload: DeductionCreate,
    current_user: User = Depends(require_roles("admin", "head")),
    db: Session = Depends(get_db)
):
    """
    Implements Feature 14 Deduction and refund handling:
    Records deduction amount, reason, clause and balance. Mentions one-time appeal right (Clause 2.24).
    """
    instr = db.query(Instrument).filter(Instrument.id == payload.instrument_id).first()
    if not instr:
        raise HTTPException(status_code=404, detail="Instrument not found")

    if payload.amount > instr.amount:
        raise HTTPException(status_code=400, detail=f"Deduction amount ({format_currency(payload.amount)}) cannot exceed instrument value ({format_currency(instr.amount)}).")

    balance_after = instr.amount - payload.amount
    before_state = {"instrument_amount": instr.amount}
    instr.amount = balance_after

    ded = Deduction(
        instrument_id=payload.instrument_id,
        release_request_id=payload.release_request_id,
        amount=payload.amount,
        reason=payload.reason,
        clause=payload.clause,
        balance_after=balance_after,
        approved_by=f"{current_user.full_name} (Bureau Head)"
    )
    db.add(ded)
    db.flush()

    # Dispatched deduction order mail
    try:
        render_and_send_mail(
            db=db,
            recipient=instr.institution.registered_email,
            recipient_role="Institution",
            template_key="DEDUCTION_ORDER",
            sent_by_user_id=current_user.id,
            sent_by_name=current_user.full_name,
            context={
                "institution_name": instr.institution.name,
                "institution_id": instr.institution.id,
                "reference": instr.reference,
                "clause": payload.clause,
                "reason": payload.reason,
                "original_amount": format_currency(before_state["instrument_amount"]),
                "deduction_amount": format_currency(payload.amount),
                "balance_after": format_currency(balance_after)
            }
        )
    except Exception:
        pass

    log_audit(
        db=db,
        actor_id=current_user.id,
        actor_name=current_user.full_name,
        actor_role=current_user.role,
        action=f"Applied deduction of {format_currency(payload.amount)} under {payload.clause} to instrument {instr.reference}",
        entity_type="Deduction",
        entity_id=ded.id,
        before_state=before_state,
        after_state={"deduction": payload.amount, "balance_after": balance_after, "clause": payload.clause}
    )
    db.commit()
    db.refresh(ded)
    return ded

@router.get("/deductions", response_model=List[DeductionOut])
def list_deductions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = db.query(Deduction).join(Instrument).join(Institution)
    if current_user.role == "institution":
        if current_user.institution_id:
            query = query.filter(Instrument.institution_id == current_user.institution_id)
        else:
            return []
    elif current_user.role == "scrutiny":
        if current_user.region_scope:
            query = query.filter(Institution.region == current_user.region_scope)

    return query.order_by(Deduction.approved_at.desc()).all()
