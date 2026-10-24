from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import RulesConfig, User
from app.schemas import RuleConfigOut, RuleConfigUpdate
from app.security import get_current_user, require_roles
from app.services.audit_service import log_audit

router = APIRouter(prefix="/rules", tags=["Rules Configuration & Policy"])

@router.get("", response_model=List[RuleConfigOut])
def get_rules(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Returns versioned rules: Table 1.4 deposit amounts, penalty tiers, reminder schedules, concessions.
    """
    return db.query(RulesConfig).filter(RulesConfig.is_active == True).order_by(RulesConfig.key.asc()).all()

@router.get("/history", response_model=List[RuleConfigOut])
def get_rules_history(
    key: Optional[str] = None,
    current_user: User = Depends(require_roles("admin", "head", "auditor")),
    db: Session = Depends(get_db)
):
    query = db.query(RulesConfig)
    if key:
        query = query.filter(RulesConfig.key == key)
    return query.order_by(RulesConfig.created_at.desc()).all()

@router.put("", response_model=RuleConfigOut)
def update_rule(
    payload: RuleConfigUpdate,
    current_user: User = Depends(require_roles("admin")),
    db: Session = Depends(get_db)
):
    """
    Updates or creates a new versioned rule.
    Archives previous version and keeps full policy change history with approval record.
    """
    latest = db.query(RulesConfig).filter(
        RulesConfig.key == payload.key,
        RulesConfig.is_active == True
    ).first()

    next_version = (latest.version + 1) if latest else 1
    before_state = {"version": latest.version, "value": latest.value} if latest else None

    if latest:
        latest.is_active = False

    new_rule = RulesConfig(
        key=payload.key,
        value=payload.value,
        version=next_version,
        valid_from=payload.valid_from or "2026-04-01",
        approved_by=payload.approved_by,
        is_active=True
    )
    db.add(new_rule)
    db.flush()

    log_audit(
        db=db,
        actor_id=current_user.id,
        actor_name=current_user.full_name,
        actor_role=current_user.role,
        action=f"Updated rule '{payload.key}' to version {next_version} (Approved by: {payload.approved_by})",
        entity_type="RulesConfig",
        entity_id=new_rule.id,
        before_state=before_state,
        after_state={"version": next_version, "value": payload.value, "approved_by": payload.approved_by}
    )
    db.commit()
    db.refresh(new_rule)
    return new_rule
