from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import AuditLog, User
from app.schemas import AuditLogOut, AuditVerificationResponse
from app.security import get_current_user, require_roles
from app.services.audit_service import verify_audit_chain

router = APIRouter(prefix="/audit", tags=["Audit Log & Tamper-Evident Trail"])

@router.get("", response_model=List[AuditLogOut])
def get_audit_trail(
    limit: int = Query(100, ge=1, le=1000),
    actor: Optional[str] = None,
    action: Optional[str] = None,
    entity_type: Optional[str] = None,
    current_user: User = Depends(require_roles("admin", "head", "auditor", "finance", "scrutiny")),
    db: Session = Depends(get_db)
):
    """
    Feature 19: Audit trail
    Immutable record of submissions, AI results, officer decisions, changes and access; hash-chained so tampering is detectable.
    """
    query = db.query(AuditLog)

    if actor:
        query = query.filter(AuditLog.actor_name.ilike(f"%{actor}%"))
    if action:
        query = query.filter(AuditLog.action.ilike(f"%{action}%"))
    if entity_type:
        query = query.filter(AuditLog.entity_type == entity_type)

    return query.order_by(AuditLog.timestamp.desc(), AuditLog.id.desc()).limit(limit).all()

@router.get("/verify", response_model=AuditVerificationResponse)
def verify_integrity(
    current_user: User = Depends(require_roles("admin", "head", "auditor")),
    db: Session = Depends(get_db)
):
    """
    Cryptographic verification endpoint:
    Traverses the entire hash chain and validates each block's SHA-256 hash against its previous hash and contents.
    Detects any database tampering, modification, or deletion.
    """
    result = verify_audit_chain(db)
    return result
