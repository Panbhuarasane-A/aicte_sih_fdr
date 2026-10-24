from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Institution, User
from app.schemas import InstitutionCreate, InstitutionOut, DepositCalculationOut
from app.security import get_current_user, require_roles, enforce_institution_or_region_access
from app.services.rules_engine import calculate_deposit_requirement, calculate_payment_penalty
from app.services.audit_service import log_audit

router = APIRouter(prefix="/institutions", tags=["Institutions"])

@router.get("", response_model=List[InstitutionOut])
def list_institutions(
    region: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = db.query(Institution)

    # RBAC filter
    if current_user.role == "institution":
        if current_user.institution_id:
            query = query.filter(Institution.id == current_user.institution_id)
        else:
            return []
    elif current_user.role == "scrutiny":
        if current_user.region_scope:
            query = query.filter(Institution.region == current_user.region_scope)
    
    if region:
        query = query.filter(Institution.region == region)

    return query.order_by(Institution.id.asc()).all()

@router.post("", response_model=InstitutionOut, status_code=status.HTTP_201_CREATED)
def create_institution(
    payload: InstitutionCreate,
    current_user: User = Depends(require_roles("admin", "head")),
    db: Session = Depends(get_db)
):
    existing = db.query(Institution).filter(Institution.id == payload.id).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Institution ID {payload.id} already exists.")

    new_inst = Institution(**payload.model_dump())
    db.add(new_inst)
    db.flush()

    log_audit(
        db=db,
        actor_id=current_user.id,
        actor_name=current_user.full_name,
        actor_role=current_user.role,
        action=f"Registered new institution: {new_inst.name} ({new_inst.id})",
        entity_type="Institution",
        entity_id=new_inst.id,
        after_state=payload.model_dump()
    )
    db.commit()
    db.refresh(new_inst)
    return new_inst

@router.get("/{id}", response_model=InstitutionOut)
def get_institution(
    id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    inst = db.query(Institution).filter(Institution.id == id).first()
    if not inst:
        raise HTTPException(status_code=404, detail="Institution not found")
    enforce_institution_or_region_access(current_user, inst)
    return inst

@router.get("/{id}/deposit-calc", response_model=DepositCalculationOut)
def get_institution_deposit_calculation(
    id: str,
    paid_override: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    inst = db.query(Institution).filter(Institution.id == id).first()
    if not inst:
        raise HTTPException(status_code=404, detail="Institution not found")
    enforce_institution_or_region_access(current_user, inst)

    calc = calculate_deposit_requirement(inst)
    pen = calculate_payment_penalty(inst, paid_date_override=paid_override, required_deposit=calc["required_deposit"])

    return {
        "institution_id": inst.id,
        "institution_name": inst.name,
        "base_amount": calc["base_amount"],
        "concession_factor": calc["concession_factor"],
        "concession_category": calc["concession_category"],
        "lease_multiplier": calc["lease_multiplier"],
        "tenure_type": calc["tenure_type"],
        "required_deposit": calc["required_deposit"],
        "calculation_breakdown": calc["calculation_breakdown"],
        "intimation_date": pen["intimation_date"],
        "due_date": pen["due_date"],
        "paid_date": pen["paid_date"],
        "penalty_pct": pen["penalty_pct"],
        "penalty_amount": pen["penalty_amount"],
        "payment_status_text": pen["payment_status_text"],
        "eligible_for_withdrawal": pen["eligible_for_withdrawal"]
    }
