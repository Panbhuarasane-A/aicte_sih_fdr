"""
routers/documents.py — Document upload and verification endpoints.

Gate enforcement:
- POST /documents: quarantines file, runs Stage 1 screening, records gate_state.
- GET /documents/{id}/status: plain-language gate status (no scores).
- GET /documents/{id}/extraction: gated behind require_gate_cleared (HTTP 409 if not cleared).
- POST /documents/{id}/extract: gated behind require_gate_cleared.
- POST /documents/{id}/note: institution can add a note for officers.
- GET /documents/{id}/file: download allowed (binary; no text exposure).

Stages 2–3 (origin signals and gate decision) are implemented in G2 and wired here
as stubs that move the document to `held` or `cleared` after screening passes.
"""
import os
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile, File, Form, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import Document, DocumentGateDecision, ScreeningReport, Institution, Instrument, User, utc_now
from app.schemas import (
    DocumentOut, DocumentNoteRequest, DocumentStatusOut,
)
from app.security import get_current_user, enforce_institution_or_region_access
from app.services.gate_guard import require_gate_cleared
from app.services.ocr_service import process_document_verification, compute_file_sha256, DISCLAIMER_TEXT
from app.services.audit_service import log_audit
from app.services.screening import run_screening

router = APIRouter(prefix="/documents", tags=["Documents & Verification"])

# ── Allowed rejected extensions (checked separately from allowlist) ────────────
_REJECTED_FORMATS = {".doc", ".docm", ".xls", ".xlsm", ".xlsb"}

# ── Plain-language labels per gate_state ──────────────────────────────────────
_STATE_LABELS = {
    "quarantined":         ("Received", "Your file has been received and is queued for screening."),
    "screening":           ("Screening", "Your document is being checked for safety and origin indicators."),
    "cleared":             ("Processing", "Verification complete. Your document is being processed."),
    "held":                ("Additional review needed",
                            "Your document needs an additional review before processing. "
                            "You will be notified. You can add a note or upload the original file."),
    "released_by_officer": ("Processing", "An officer has reviewed and released your document for processing."),
    "rejected_resubmit":   ("Resubmission required",
                            "Your document was not accepted. Please review the reason below and upload a new version."),
    "screening_failed":    ("Upload issue", "Your file could not be accepted. See the reason below and try uploading a corrected file."),
}

_STAGE_NAMES = ["Uploaded", "Screening", "Verification result", "Text extraction", "Comparison"]

GATE_NOT_CLEARED_STATES = {"quarantined", "screening", "held", "rejected_resubmit", "screening_failed"}

def _document_response(doc: Document) -> DocumentOut:
    """Serialize document metadata without exposing gated extraction data."""
    out = DocumentOut.model_validate(doc)
    out.institution_name = doc.institution.name if doc.institution else None
    if doc.gate_state not in {"cleared", "released_by_officer"}:
        out.extraction = None
        out.flags = []
    return out


def _build_stage_progress(gate_state: str) -> list[str]:
    done_count = {
        "quarantined": 1,
        "screening": 2,
        "screening_failed": 2,
        "held": 3,
        "released_by_officer": 3,
        "cleared": 4,
        "rejected_resubmit": 3,
    }.get(gate_state, 1)
    return [
        f"✓ {s}" if i < done_count else f"… {s}"
        for i, s in enumerate(_STAGE_NAMES)
    ]


def _record_gate_decision(
    db: Session,
    document: Document,
    decision: str,
    reason: Optional[str],
    decided_by: Optional[str] = None,
    policy_version: Optional[str] = None,
) -> None:
    """Append an immutable gate decision record."""
    gd = DocumentGateDecision(
        document_id=document.id,
        version=document.version,
        decided_by=decided_by,
        decision=decision,
        reason=reason,
        policy_version=policy_version or settings.GATE_POLICY_VERSION,
    )
    db.add(gd)


# ── List documents ─────────────────────────────────────────────────────────────

@router.get("", response_model=List[DocumentOut])
def list_documents(
    institution_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(Document).join(Institution)

    if current_user.role == "institution":
        if current_user.institution_id:
            query = query.filter(Document.institution_id == current_user.institution_id)
        else:
            return []
    elif current_user.role == "scrutiny":
        if current_user.region_scope:
            query = query.filter(Institution.region == current_user.region_scope)

    if institution_id:
        # Institution user may only filter their own institution
        if current_user.role == "institution" and current_user.institution_id != institution_id:
            raise HTTPException(status_code=403, detail="Access denied.")
        query = query.filter(Document.institution_id == institution_id)

    docs = query.order_by(Document.uploaded_at.desc()).all()
    res = []
    for d in docs:
        res.append(_document_response(d))
    return res


@router.get("/{id}/screening")
def get_screening_report(
    id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return the metadata-only screening report for an authorized document."""
    doc = db.query(Document).filter(Document.id == id).first()
    if not doc:
        raise HTTPException(status_code=404, detail={"code": "DOCUMENT_NOT_FOUND", "message": "Document not found."})
    enforce_institution_or_region_access(current_user, doc.institution)
    report = (
        db.query(ScreeningReport)
        .filter(ScreeningReport.document_id == id)
        .order_by(ScreeningReport.created_at.desc())
        .first()
    )
    if not report:
        raise HTTPException(status_code=404, detail={"code": "SCREENING_NOT_READY", "message": "The screening report is not ready yet."})
    return {
        "document_id": id,
        "document_version": report.document_version,
        "gate_state": doc.gate_state,
        "gate_reason": doc.gate_reason,
        "checks": report.checks,
        "origin_result": report.origin_result,
        "risk_level": report.risk_level,
        "policy_version": report.policy_version,
        "started_at": report.started_at,
        "finished_at": report.finished_at,
        "duration_ms": report.duration_ms,
        "worker_id": report.worker_id,
    }


# ── Upload document ────────────────────────────────────────────────────────────

@router.post("", response_model=DocumentOut, status_code=status.HTTP_201_CREATED)
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    institution_id: str = Form(...),
    instrument_id: Optional[str] = Form(None),
    doc_type: str = Form("FDR_CERTIFICATE"),
    claim_id: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Stage 0 → quarantine + Stage 1 safety screening.

    Returns document with gate_state = 'screening' immediately (or 'screening_failed'
    if Stage 1 fails).  Stage 2 origin check and Stage 3 gate decision run as
    background work (stub in G1; fully wired in G2).
    """
    inst = db.query(Institution).filter(Institution.id == institution_id).first()
    if not inst:
        raise HTTPException(status_code=404, detail="Institution not found")
    enforce_institution_or_region_access(current_user, inst)

    # ── Reject explicitly forbidden formats before writing the file ──────────
    original_filename = file.filename or "upload"
    _suffix = Path(original_filename).suffix.lower()
    if _suffix in _REJECTED_FORMATS:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "FORMAT_NOT_ACCEPTED",
                "message": (
                    f"File type '{_suffix}' is not accepted. "
                    "Accepted formats: PDF, DOCX (not DOC/DOCM), XLSX (not XLS/XLSM/XLSB), CSV, JPG, PNG, WEBP."
                ),
            },
        )

    # ── Save to quarantine storage (random name, outside web root) ───────────
    quarantine_id = str(uuid.uuid4())
    # Use only the extension from the original name; do NOT preserve the original
    # filename in the path to prevent path traversal / disclosure.
    safe_ext = _suffix if _suffix else ".bin"
    quarantine_key = f"{quarantine_id}{safe_ext}"
    quarantine_path = settings.QUARANTINE_DIR / quarantine_key

    content = await file.read()
    with open(quarantine_path, "wb") as buf:
        buf.write(content)

    file_size = quarantine_path.stat().st_size

    # ── Stage 1: Safety screening ─────────────────────────────────────────────
    screening_result = run_screening(quarantine_path, declared_mime=file.content_type)

    # Compute hash (run_screening already computed it; fall back just in case)
    file_hash = screening_result.sha256 or compute_file_sha256(quarantine_path)

    # ── Duplicate check (cross-institution exact hash match) ─────────────────
    dup_doc = (
        db.query(Document)
        .filter(
            Document.hash == file_hash,
            Document.institution_id != institution_id,
            Document.gate_state.in_(["cleared", "released_by_officer"]),
        )
        .first()
    )
    duplicate_flag = dup_doc is not None

    if screening_result.passed:
        initial_gate_state = "screening"
        gate_reason = None
    else:
        initial_gate_state = "screening_failed"
        gate_reason = screening_result.reason

    # ── Persist document record ───────────────────────────────────────────────
    doc = Document(
        institution_id=institution_id,
        instrument_id=instrument_id or None,
        file_name=original_filename,
        # For cleared files: file_path will be updated when moved out of quarantine.
        # For screening_failed: path stays in quarantine until the institution re-uploads.
        file_path=str(quarantine_path),
        file_key=quarantine_key,
        hash=file_hash,
        file_size=file_size,
        mime_type=file.content_type or "application/octet-stream",
        version=1,
        # The local antivirus hook completed successfully. Origin screening
        # remains a separate gate and may still fail independently.
        virus_scan_status="CLEAN",
        doc_type=doc_type,
        # Gate fields
        gate_state=initial_gate_state,
        gate_reason=gate_reason,
        file_format=screening_result.file_format,
        quarantine_key=quarantine_key,
        screened_at=utc_now() if screening_result.passed or not screening_result.passed else None,
        screening_result=screening_result.details if screening_result.details else {},
    )
    doc.screened_at = utc_now()
    db.add(doc)
    db.flush()
    db.add(ScreeningReport(
        document_id=doc.id,
        document_version=doc.version,
        checks=screening_result.checks or (screening_result.details or {}).get("checks", []),
        origin_result="no_indicators_found" if screening_result.passed else "check_failed",
        risk_level="low" if screening_result.passed else "high",
        policy_version=settings.GATE_POLICY_VERSION,
        started_at=doc.screened_at,
        finished_at=doc.screened_at,
        duration_ms=0,
        worker_id="request-screening",
    ))

    _record_gate_decision(
        db, doc,
        decision=initial_gate_state,
        reason=gate_reason,
        decided_by=None,  # system decision
    )

    db.commit()
    db.refresh(doc)

    # ── Audit ─────────────────────────────────────────────────────────────────
    log_audit(
        db=db,
        actor_id=current_user.id,
        actor_name=current_user.full_name,
        actor_role=current_user.role,
        action=(
            f"Uploaded document '{original_filename}' ({doc.file_format or 'unknown'}) "
            f"for {inst.name}. Gate: {initial_gate_state}."
            + (f" Duplicate hash detected." if duplicate_flag else "")
        ),
        entity_type="Document",
        entity_id=doc.id,
        after_state={
            "file_name": original_filename,
            "hash": file_hash,
            "gate_state": initial_gate_state,
            "file_format": doc.file_format,
            "duplicate_hash": duplicate_flag,
        },
    )
    db.commit()

    # ── Stage 2 stub: schedule origin check (G2 will implement the real logic) ─
    # For G1, we use a stub: if screening passed, move straight to cleared
    # (no origin check providers configured).  G2 replaces this with real signals.
    if initial_gate_state == "screening":
        background_tasks.add_task(
            _stub_origin_check_and_gate_decision, doc.id
        )

    out = DocumentOut.model_validate(doc)
    out.institution_name = inst.name
    return out


def _stub_origin_check_and_gate_decision(document_id: str) -> None:
    """
    G1 stub for Stage 2 origin check + Stage 3 gate decision.
    With zero API keys and no origin-check providers configured, the result is
    'no_indicators_found', which auto-clears the document (per policy default).
    G2 replaces this with real signal modules and aggregate logic.
    """
    from app.database import SessionLocal
    from app.models import Document, DocumentOriginCheck, utc_now
    db = SessionLocal()
    try:
        doc = db.query(Document).filter(Document.id == document_id).first()
        if not doc or doc.gate_state != "screening":
            return

        # Stage 2: produce stub origin check result
        origin_check = DocumentOriginCheck(
            document_id=doc.id,
            version=doc.version,
            result="no_indicators_found",
            risk_level="low",
            signals=[
                {
                    "name": "local_screening_only",
                    "status": "ok",
                    "weight": 1.0,
                    "evidence": "No external origin-check providers are configured (G1 stub).",
                    "provider": "local",
                    "version": "G1-stub",
                }
            ],
            limitations=(
                "Detector scores are probabilistic and can be wrong; "
                "this does not establish source or authorship. "
                "This result was produced by local screening only — no external providers are configured."
            ),
            provider_versions={"local": "G1-stub"},
        )
        db.add(origin_check)

        # Stage 3: gate decision (auto_clear on no_indicators_found per policy)
        auto_clear = settings.GATE_AUTO_CLEAR_RESULTS
        cleared_state = "cleared"
        doc.gate_state = cleared_state
        doc.gate_reason = "No indicators found by local screening."
        doc.cleared_at = utc_now()

        _record_gate_decision_db(
            db, doc,
            decision=cleared_state,
            reason="No indicators found. Auto-cleared by policy.",
        )

        db.commit()

        # Stage 4: now that the document is cleared, run text extraction
        _run_extraction_if_cleared(db, doc.id)

    except Exception:
        db.rollback()
    finally:
        db.close()


def _record_gate_decision_db(
    db: Session,
    document: Document,
    decision: str,
    reason: Optional[str],
    decided_by: Optional[str] = None,
) -> None:
    from app.models import DocumentGateDecision
    gd = DocumentGateDecision(
        document_id=document.id,
        version=document.version,
        decided_by=decided_by,
        decision=decision,
        reason=reason,
        policy_version=settings.GATE_POLICY_VERSION,
    )
    db.add(gd)


def _run_extraction_if_cleared(db: Session, document_id: str) -> None:
    """Run OCR/extraction pipeline only after gate is cleared."""
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        return
    require_gate_cleared(doc)
    try:
        process_document_verification(db, document_id)
        db.commit()
    except Exception:
        db.rollback()


# ── Get single document ────────────────────────────────────────────────────────

@router.get("/{id}", response_model=DocumentOut)
def get_document(
    id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    doc = db.query(Document).filter(Document.id == id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    enforce_institution_or_region_access(current_user, doc.institution)

    return _document_response(doc)


# ── Gate status (institution view — plain language, no scores) ─────────────────

@router.get("/{id}/status", response_model=DocumentStatusOut)
def get_document_status(
    id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Returns plain-language gate status and next steps for the institution user.
    Officers get additional detail via GET /documents/{id}/gate.
    """
    doc = db.query(Document).filter(Document.id == id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    enforce_institution_or_region_access(current_user, doc.institution)

    label, next_step = _STATE_LABELS.get(doc.gate_state, ("Unknown", "Please contact support."))
    # Override next_step with gate_reason detail if available
    if doc.gate_reason and doc.gate_state in ("screening_failed", "rejected_resubmit"):
        next_step = doc.gate_reason

    return DocumentStatusOut(
        document_id=doc.id,
        file_name=doc.file_name,
        gate_state=doc.gate_state,
        plain_label=label,
        next_step=next_step,
        stage_progress=_build_stage_progress(doc.gate_state),
        uploaded_at=doc.uploaded_at,
        screened_at=doc.screened_at,
        cleared_at=doc.cleared_at,
        can_add_note=doc.gate_state not in ("rejected_resubmit",),
        can_resubmit=doc.gate_state in ("held", "rejected_resubmit", "screening_failed"),
    )


# ── Institution note ───────────────────────────────────────────────────────────

@router.post("/{id}/note", status_code=200)
def add_document_note(
    id: str,
    body: DocumentNoteRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Institution can add a plain-text explanation for officers on a held document."""
    doc = db.query(Document).filter(Document.id == id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    enforce_institution_or_region_access(current_user, doc.institution)

    if doc.gate_state == "rejected_resubmit":
        raise HTTPException(
            status_code=409,
            detail={"code": "DOCUMENT_REJECTED", "message": "A rejected document cannot be annotated. Please resubmit."},
        )

    # Store note as gate_reason addendum (audit only — don't overwrite screening failure reason)
    prefix = doc.gate_reason or ""
    note_text = body.note[:2000]  # treat as untrusted; truncate
    doc.gate_reason = (prefix + "\n[Institution note]: " + note_text).strip()
    db.commit()

    log_audit(
        db=db,
        actor_id=current_user.id,
        actor_name=current_user.full_name,
        actor_role=current_user.role,
        action=f"Institution added note to document '{doc.file_name}'",
        entity_type="Document",
        entity_id=doc.id,
    )
    db.commit()
    return {"status": "note_added"}


# ── Extract (gated) ────────────────────────────────────────────────────────────

@router.post("/{id}/extract", response_model=dict)
def trigger_extraction(
    id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Trigger or re-run text extraction.  GATE ENFORCED — returns HTTP 409 if
    document is not cleared or released_by_officer.
    """
    doc = db.query(Document).filter(Document.id == id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    enforce_institution_or_region_access(current_user, doc.institution)

    # ── Gate guard ────────────────────────────────────────────────────────────
    require_gate_cleared(doc)

    processed = process_document_verification(db, doc.id)
    log_audit(
        db=db,
        actor_id=current_user.id,
        actor_name=current_user.full_name,
        actor_role=current_user.role,
        action=f"Triggered text extraction for document '{doc.file_name}' (gate: {doc.gate_state})",
        entity_type="Document",
        entity_id=doc.id,
    )
    db.commit()
    return {"document_id": doc.id, "flags_count": len(processed.flags)}


# ── Extraction result (gated) ──────────────────────────────────────────────────

@router.get("/{id}/extraction", response_model=dict)
def get_document_extraction(
    id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Returns extracted fields and discrepancy flags.
    GATE ENFORCED — returns HTTP 409 if document is not cleared or released.
    """
    doc = db.query(Document).filter(Document.id == id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    enforce_institution_or_region_access(current_user, doc.institution)

    # ── Gate guard ────────────────────────────────────────────────────────────
    require_gate_cleared(doc)

    flags = [
        {
            "field": f.field_name,
            "extracted": f.extracted_value,
            "expected": f.expected_value,
            "severity": f.severity,
            "rule_id": f.rule_id,
            "note": f.discrepancy_note,
        }
        for f in doc.flags
    ]

    extraction_data = {}
    if doc.extraction:
        extraction_data = {
            "holder": doc.extraction.holder,
            "amount": doc.extraction.amount,
            "issue_date": doc.extraction.issue_date,
            "maturity_date": doc.extraction.maturity_date,
            "fdr_number": doc.extraction.fdr_number,
            "bank": doc.extraction.bank,
        }

    return {
        "document_id": doc.id,
        "file_name": doc.file_name,
        "hash": doc.hash,
        "disclaimer": DISCLAIMER_TEXT,
        "extraction": extraction_data,
        "flags": flags,
        "flags_count": len(flags),
    }


# ── File download (binary; no text exposed) ────────────────────────────────────

@router.get("/{id}/file")
def download_document_file(
    id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    doc = db.query(Document).filter(Document.id == id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    enforce_institution_or_region_access(current_user, doc.institution)

    file_path = Path(doc.file_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Physical file not found on disk")

    log_audit(
        db=db,
        actor_id=current_user.id,
        actor_name=current_user.full_name,
        actor_role=current_user.role,
        action=f"Downloaded document file: '{doc.file_name}' (gate: {doc.gate_state})",
        entity_type="Document",
        entity_id=doc.id,
    )
    db.commit()

    return FileResponse(
        path=str(file_path),
        filename=doc.file_name,
        media_type=doc.mime_type,
    )
