from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Instrument, Institution, User
from app.schemas import InstrumentCreate, InstrumentUpdate, InstrumentOut
from app.security import get_current_user, require_roles, enforce_institution_or_region_access
from app.services.audit_service import log_audit

router = APIRouter(prefix="/instruments", tags=["Instruments & FDRs"])

@router.get("", response_model=List[InstrumentOut])
def list_instruments(
    institution_id: Optional[str] = None,
    status_filter: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = db.query(Instrument).join(Institution)

    if current_user.role == "institution":
        if current_user.institution_id:
            query = query.filter(Instrument.institution_id == current_user.institution_id)
        else:
            return []
    elif current_user.role == "scrutiny":
        if current_user.region_scope:
            query = query.filter(Institution.region == current_user.region_scope)

    if institution_id:
        query = query.filter(Instrument.institution_id == institution_id)

    if status_filter:
        query = query.filter(Instrument.status == status_filter)

    items = query.order_by(Instrument.maturity_date.asc()).all()

    today = datetime.now().date()
    res = []
    for item in items:
        out = InstrumentOut.model_validate(item)
        out.institution_name = item.institution.name if item.institution else None
        try:
            mat_dt = datetime.strptime(item.maturity_date, "%Y-%m-%d").date()
            out.days_to_maturity = (mat_dt - today).days
        except Exception:
            out.days_to_maturity = None
        res.append(out)

    return res

@router.post("", response_model=InstrumentOut, status_code=status.HTTP_201_CREATED)
def create_instrument(
    payload: InstrumentCreate,
    current_user: User = Depends(require_roles("admin", "head", "scrutiny", "finance")),
    db: Session = Depends(get_db)
):
    inst = db.query(Institution).filter(Institution.id == payload.institution_id).first()
    if not inst:
        raise HTTPException(status_code=404, detail="Institution not found")
    enforce_institution_or_region_access(current_user, inst)

    new_instr = Instrument(**payload.model_dump())
    db.add(new_instr)
    db.flush()

    # If this replaces an older instrument, update old instrument status to "renewed"
    if payload.replaces_id:
        old_instr = db.query(Instrument).filter(Instrument.id == payload.replaces_id).first()
        if old_instr:
            old_instr.status = "renewed"
            log_audit(
                db=db,
                actor_id=current_user.id,
                actor_name=current_user.full_name,
                actor_role=current_user.role,
                action=f"Linked renewal/replacement instrument {new_instr.reference} to old instrument {old_instr.reference}",
                entity_type="Instrument",
                entity_id=old_instr.id,
                before_state={"status": "matured"},
                after_state={"status": "renewed", "replaced_by": new_instr.id}
            )

    log_audit(
        db=db,
        actor_id=current_user.id,
        actor_name=current_user.full_name,
        actor_role=current_user.role,
        action=f"Created instrument {new_instr.reference} ({new_instr.type}) for {inst.name}",
        entity_type="Instrument",
        entity_id=new_instr.id,
        after_state=payload.model_dump()
    )
    db.commit()
    db.refresh(new_instr)

    out = InstrumentOut.model_validate(new_instr)
    out.institution_name = inst.name
    return out

@router.patch("/{id}", response_model=InstrumentOut)
def update_instrument(
    id: str,
    payload: InstrumentUpdate,
    current_user: User = Depends(require_roles("admin", "head", "scrutiny", "finance")),
    db: Session = Depends(get_db)
):
    instr = db.query(Instrument).filter(Instrument.id == id).first()
    if not instr:
        raise HTTPException(status_code=404, detail="Instrument not found")
    enforce_institution_or_region_access(current_user, instr.institution)

    before_state = {
        "reference": instr.reference,
        "amount": instr.amount,
        "maturity_date": instr.maturity_date,
        "status": instr.status,
        "replaces_id": instr.replaces_id
    }

    update_data = payload.model_dump(exclude_unset=True)
    for field, val in update_data.items():
        setattr(instr, field, val)

    log_audit(
        db=db,
        actor_id=current_user.id,
        actor_name=current_user.full_name,
        actor_role=current_user.role,
        action=f"Updated instrument {instr.reference}",
        entity_type="Instrument",
        entity_id=instr.id,
        before_state=before_state,
        after_state=update_data
    )
    db.commit()
    db.refresh(instr)

    out = InstrumentOut.model_validate(instr)
    out.institution_name = instr.institution.name if instr.institution else None
    return out
