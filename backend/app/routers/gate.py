"""
routers/gate.py — Officer gate endpoints for document origin review.

Officer-only endpoints (G1 stubs; fully secured and tested in G3):
  GET  /documents/gate/queue          — held documents queue
  GET  /documents/{id}/gate           — full signals + limitations (officer only)
  POST /documents/{id}/gate/release   — officer releases held document {reason required}
  POST /documents/{id}/gate/reject    — officer rejects with resubmit instruction {reason required}
  POST /documents/{id}/gate/request-clarification — officer requests more info

Admin:
  GET  /settings/gate-policy
  PATCH /settings/gate-policy

Every action is audited. Reason is required for release and reject.
"""
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import Document, DocumentGateDecision, DocumentOriginCheck, Institution, User, utc_now
from app.schemas import (
    DocumentOut, GateDecisionOut, GateReleaseRequest, GateRejectRequest,
    GateClarificationRequest, OriginCheckOut, SignalOut,
)
from app.security import get_current_user, require_roles, enforce_institution_or_region_access
from app.services.audit_service import log_audit

router = APIRouter(tags=["Document Gate (Officer)"])

_OFFICER_ROLES = ("head", "scrutiny", "finance", "committee", "auditor", "admin")


def _is_officer(user: User) -> bool:
    return user.role in _OFFICER_ROLES


def _assert_officer(user: User) -> None:
    if not _is_officer(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "OFFICER_ONLY", "message": "This endpoint is restricted to officers."},
        )


def _get_doc_or_404(db: Session, doc_id: str) -> Document:
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc


def _record_gate_decision(
    db: Session,
    document: Document,
    decision: str,
    reason: Optional[str],
    decided_by: Optional[str] = None,
) -> DocumentGateDecision:
    gd = DocumentGateDecision(
        document_id=document.id,
        version=document.version,
        decided_by=decided_by,
        decision=decision,
        reason=reason,
        policy_version=settings.GATE_POLICY_VERSION,
    )
    db.add(gd)
    return gd


# ── Held queue ─────────────────────────────────────────────────────────────────

@router.get("/documents/gate/queue", response_model=List[DocumentOut])
def get_held_queue(
    state: str = "held",
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Officer queue: documents in a given gate state (default: held)."""
    _assert_officer(current_user)

    allowed_states = {"held", "screening", "screening_failed", "quarantined"}
    if state not in allowed_states:
        raise HTTPException(status_code=422, detail=f"Query state must be one of: {allowed_states}")

    query = db.query(Document).filter(Document.gate_state == state)
    if current_user.role == "scrutiny" and current_user.region_scope:
        query = query.join(Institution).filter(Institution.region == current_user.region_scope)

    docs = query.order_by(Document.uploaded_at.asc()).all()
    res = []
    for d in docs:
        out = DocumentOut.model_validate(d)
        out.institution_name = d.institution.name if d.institution else None
        out.extraction = None
        out.flags = []
        res.append(out)
    return res


# ── Gate detail for officer ────────────────────────────────────────────────────

@router.get("/documents/{id}/gate")
def get_gate_detail(
    id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Full gate detail: signals, evidence, limitations, institution notes (officer only)."""
    _assert_officer(current_user)
    doc = _get_doc_or_404(db, id)
    enforce_institution_or_region_access(current_user, doc.institution)

    latest_check = (
        db.query(DocumentOriginCheck)
        .filter(DocumentOriginCheck.document_id == id)
        .order_by(DocumentOriginCheck.checked_at.desc())
        .first()
    )

    decisions = (
        db.query(DocumentGateDecision)
        .filter(DocumentGateDecision.document_id == id)
        .order_by(DocumentGateDecision.created_at.asc())
        .all()
    )

    return {
        "document_id": id,
        "file_name": doc.file_name,
        "file_format": doc.file_format,
        "gate_state": doc.gate_state,
        "gate_reason": doc.gate_reason,
        "institution_id": doc.institution_id,
        "institution_name": doc.institution.name if doc.institution else None,
        "uploaded_at": doc.uploaded_at,
        "screened_at": doc.screened_at,
        "cleared_at": doc.cleared_at,
        "screening_result": doc.screening_result,
        "origin_check": OriginCheckOut.model_validate(latest_check).model_dump() if latest_check else None,
        "decisions": [GateDecisionOut.model_validate(d).model_dump() for d in decisions],
    }


# ── Officer: release ───────────────────────────────────────────────────────────

@router.post("/documents/{id}/gate/release")
def gate_release(
    id: str,
    body: GateReleaseRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Officer releases a held document for extraction.
    Reason is REQUIRED (audited). Creates an immutable gate decision record.
    """
    _assert_officer(current_user)
    doc = _get_doc_or_404(db, id)
    enforce_institution_or_region_access(current_user, doc.institution)

    if not body.reason or not body.reason.strip():
        raise HTTPException(
            status_code=422,
            detail={"code": "REASON_REQUIRED", "message": "A reason is required to release a document."},
        )

    if doc.gate_state not in ("held", "screening_failed"):
        raise HTTPException(
            status_code=409,
            detail={
                "code": "INVALID_STATE_TRANSITION",
                "message": f"Document is in state '{doc.gate_state}' and cannot be released from that state.",
            },
        )

    doc.gate_state = "released_by_officer"
    doc.gate_reason = body.reason.strip()
    doc.cleared_at = utc_now()

    _record_gate_decision(
        db, doc,
        decision="released_by_officer",
        reason=body.reason.strip(),
        decided_by=current_user.id,
    )

    log_audit(
        db=db,
        actor_id=current_user.id,
        actor_name=current_user.full_name,
        actor_role=current_user.role,
        action=f"Officer released document '{doc.file_name}' for extraction. Reason: {body.reason[:100]}",
        entity_type="Document",
        entity_id=doc.id,
        before_state={"gate_state": "held"},
        after_state={"gate_state": "released_by_officer", "reason": body.reason[:200]},
    )
    db.commit()

    # Trigger extraction now that the document is released
    from app.routers.documents import _run_extraction_if_cleared
    _run_extraction_if_cleared(db, doc.id)

    # Notify institution (stub — full notifications in G2)
    return {"status": "released_by_officer", "document_id": id}


# ── Officer: reject / resubmit ─────────────────────────────────────────────────

@router.post("/documents/{id}/gate/reject")
def gate_reject(
    id: str,
    body: GateRejectRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Officer rejects a held document and requests resubmission.
    Reason is REQUIRED (audited). Institution is notified (stub in G1).
    """
    _assert_officer(current_user)
    doc = _get_doc_or_404(db, id)
    enforce_institution_or_region_access(current_user, doc.institution)

    if not body.reason or not body.reason.strip():
        raise HTTPException(
            status_code=422,
            detail={"code": "REASON_REQUIRED", "message": "A reason is required to reject a document."},
        )

    if doc.gate_state not in ("held", "screening_failed"):
        raise HTTPException(
            status_code=409,
            detail={
                "code": "INVALID_STATE_TRANSITION",
                "message": f"Document in state '{doc.gate_state}' cannot be rejected from that state.",
            },
        )

    doc.gate_state = "rejected_resubmit"
    doc.gate_reason = body.reason.strip()

    _record_gate_decision(
        db, doc,
        decision="rejected_resubmit",
        reason=body.reason.strip(),
        decided_by=current_user.id,
    )

    log_audit(
        db=db,
        actor_id=current_user.id,
        actor_name=current_user.full_name,
        actor_role=current_user.role,
        action=f"Officer rejected document '{doc.file_name}' (resubmit required). Reason: {body.reason[:100]}",
        entity_type="Document",
        entity_id=doc.id,
        before_state={"gate_state": "held"},
        after_state={"gate_state": "rejected_resubmit", "reason": body.reason[:200]},
    )
    db.commit()
    return {"status": "rejected_resubmit", "document_id": id}


# ── Officer: request clarification ────────────────────────────────────────────

@router.post("/documents/{id}/gate/request-clarification")
def gate_request_clarification(
    id: str,
    body: GateClarificationRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Officer requests additional information from the institution."""
    _assert_officer(current_user)
    doc = _get_doc_or_404(db, id)
    enforce_institution_or_region_access(current_user, doc.institution)

    # Append clarification request to gate_reason
    msg = body.message[:1000].strip()
    prefix = doc.gate_reason or ""
    doc.gate_reason = (prefix + "\n[Officer clarification request]: " + msg).strip()

    log_audit(
        db=db,
        actor_id=current_user.id,
        actor_name=current_user.full_name,
        actor_role=current_user.role,
        action=f"Officer requested clarification for document '{doc.file_name}'",
        entity_type="Document",
        entity_id=doc.id,
    )
    db.commit()
    return {"status": "clarification_requested", "document_id": id}


# ── Admin: gate policy ─────────────────────────────────────────────────────────

@router.get("/settings/gate-policy")
def get_gate_policy(current_user: User = Depends(require_roles("admin"))):
    """Return current gate policy settings (admin only)."""
    return {
        "GATE_AUTO_CLEAR_RESULTS": settings.GATE_AUTO_CLEAR_RESULTS,
        "GATE_NOT_ASSESSABLE_POLICY": settings.GATE_NOT_ASSESSABLE_POLICY,
        "GATE_HOLD_RESULTS": settings.GATE_HOLD_RESULTS,
        "GATE_RETRY_ON_CHECK_FAILED": settings.GATE_RETRY_ON_CHECK_FAILED,
        "GATE_POLICY_VERSION": settings.GATE_POLICY_VERSION,
        "USE_SYNTHETIC_ONLY": settings.USE_SYNTHETIC_ONLY,
        "note": (
            "Stricter hold policies create more officer work. "
            "clear_with_note for GATE_NOT_ASSESSABLE_POLICY means CSV files are "
            "integrity-screened only (not origin-assessed); the UI labels this explicitly."
        ),
    }
