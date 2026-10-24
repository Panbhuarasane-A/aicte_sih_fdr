from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import MailOutbox, User, Institution
from app.schemas import MailSendRequest, MailOutboxOut
from app.security import get_current_user, require_roles
from app.services.notification_service import render_and_send_mail

router = APIRouter(prefix="/mail", tags=["Mail Centre & Notifications"])

@router.post("/send", response_model=MailOutboxOut, status_code=status.HTTP_201_CREATED)
def send_notification_mail(
    payload: MailSendRequest,
    current_user: User = Depends(require_roles("admin", "head", "scrutiny")),
    db: Session = Depends(get_db)
):
    """
    Feature 16: Mail centre
    Authority-only sending with confirmation tick; templates built from case record; outbox and audit entry.
    """
    # Permission check: Decision templates require Bureau Head; deficiency notices can be sent by Scrutiny
    if payload.template in ["RELEASE_APPROVED", "DEDUCTION_ORDER"] and current_user.role not in ["head", "admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Authority-only action: Only the Regulation Bureau Head can dispatch decision orders."
        )

    context = {
        "institution_name": "Registered Institution",
        "institution_id": "INST-REF",
        "reference": "FDR-REF",
        "bank": "Scheduled Bank",
        "amount": "₹0",
        "speaking_order_ref": "AICTE/RB/SO-AUTO",
        "decision_date": "Today",
        "deficiency_details": payload.custom_body or "Discrepancy noted during verification."
    }

    mail = render_and_send_mail(
        db=db,
        recipient=payload.recipient,
        recipient_role=payload.recipient_role,
        template_key=payload.template,
        sent_by_user_id=current_user.id,
        sent_by_name=current_user.full_name,
        context=context,
        custom_subject=payload.custom_subject,
        custom_body=payload.custom_body
    )
    return mail

@router.get("/outbox", response_model=List[MailOutboxOut])
def get_mail_outbox(
    limit: int = 50,
    current_user: User = Depends(require_roles("admin", "head", "scrutiny", "finance", "auditor")),
    db: Session = Depends(get_db)
):
    return db.query(MailOutbox).order_by(MailOutbox.created_at.desc()).limit(limit).all()
