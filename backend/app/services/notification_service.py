import uuid
from typing import Optional
from sqlalchemy.orm import Session
from app.models import MailOutbox, Institution, Instrument, ReleaseRequest, Deduction
from app.services.audit_service import log_audit
from app.services.rules_engine import format_currency

TEMPLATES = {
    "RELEASE_APPROVED": {
        "subject": "AICTE Regulation Bureau: Release of Fixed Deposit Receipt Approved - Ref: {reference}",
        "body": """To The Head of Institution,
{institution_name} ({institution_id})

Subject: Approval for Release / Return of Security Deposit FDR ({reference})

This is to communicate that the competent authority (Regulation Bureau Head) has approved the release of your Fixed Deposit Receipt ({reference}) held with {bank} for an amount of {amount}.

Speaking Order Reference: {speaking_order_ref}
Date of Decision: {decision_date}

The original FDR discharge document and letter of no objection will be dispatched to your registered postal address.

Yours faithfully,
Competent Authority / Regulation Bureau
All India Council for Technical Education (AICTE), New Delhi"""
    },
    "DEDUCTION_ORDER": {
        "subject": "AICTE Speaking Order: Penalty Deduction from Security Deposit - {reference}",
        "body": """To The Head of Institution,
{institution_name} ({institution_id})

Subject: Speaking Order regarding Deduction from Security Deposit under {clause}

Notice is hereby given that a deduction of {deduction_amount} has been sanctioned from your instrument ({reference}) pursuant to {clause}.

Reason for deduction: {reason}
Original Amount: {original_amount}
Deduction Amount: {deduction_amount}
Remaining Balance: {balance_after}

Please note: You are entitled to ONE formal appeal against this order before the Standing Hearing Committee / Appellate Committee as per Clause 2.24 of the Approval Process Handbook.

Yours faithfully,
Regulation Bureau Head
AICTE New Delhi"""
    },
    "APPROVAL_GRANTED": {
        "subject": "AICTE Approval 2026-27: Security Deposit Verification Complete - {institution_name}",
        "body": """To The Principal / Director,
{institution_name}

Subject: Completion of Security Deposit / FDR Verification for Academic Cycle 2026-27

We are pleased to inform you that your security deposit / FDR compliance verification has been satisfactorily recorded by the Scrutiny Committee.

Required Deposit: {required_deposit}
Verified Deposit Amount: {verified_amount}
Approval Period: 2024-2027

Thank you for your compliance.
Regulation Bureau, AICTE New Delhi"""
    },
    "IMPORTANT_NOTICE": {
        "subject": "URGENT: AICTE Deficiency Notice regarding Security Deposit - {institution_name}",
        "body": """To The Head of Institution,
{institution_name}

Subject: Urgent Notice regarding Security Deposit / FDR Deficiency

During administrative scrutiny, the following discrepancy was noted in your deposit submission:
{deficiency_details}

You are advised to submit the rectified documents or payment proof on the AICTE Security Deposit Portal within 15 days of this intimation to avoid penalty action under Chapter II of the Approval Process Handbook.

Scrutiny Officer, AICTE"""
    }
}

def render_and_send_mail(
    db: Session,
    recipient: str,
    recipient_role: str,
    template_key: str,
    sent_by_user_id: str,
    sent_by_name: str,
    context: dict,
    custom_subject: Optional[str] = None,
    custom_body: Optional[str] = None
) -> MailOutbox:
    tpl = TEMPLATES.get(template_key)
    if not tpl and not (custom_subject and custom_body):
        raise ValueError(f"Unknown template '{template_key}' and no custom subject/body provided.")

    if custom_subject:
        subject = custom_subject
    else:
        subject = tpl["subject"].format(**context)

    if custom_body:
        body = custom_body
    else:
        body = tpl["body"].format(**context)

    msg_id = f"AICTE-GOV-SMTP-{uuid.uuid4().hex[:12].upper()}"

    mail = MailOutbox(
        recipient=recipient,
        recipient_role=recipient_role,
        template=template_key,
        subject=subject,
        body_rendered=body,
        status="SENT",
        sent_by=f"{sent_by_name} ({sent_by_user_id})",
        provider_message_id=msg_id
    )
    db.add(mail)
    db.flush()

    # Log to audit trail
    log_audit(
        db=db,
        actor_id=sent_by_user_id,
        actor_name=sent_by_name,
        actor_role="OFFICER",
        action=f"Dispatched official notification mail ({template_key}) to {recipient}",
        entity_type="MailOutbox",
        entity_id=mail.id,
        after_state={"recipient": recipient, "template": template_key, "subject": subject, "provider_message_id": msg_id}
    )

    db.commit()
    db.refresh(mail)
    return mail
