"""Persisted orchestration for document safety screening."""
from __future__ import annotations

import os
import time
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy.orm import Session

from app.config import settings
from app.models import Document, ScreeningReport, utc_now
from app.services.screening import run_screening


VALID_TRANSITIONS = {
    "quarantined": {"screening", "screening_failed"},
    "screening": {"cleared", "held", "screening_failed"},
    "held": {"released_by_officer", "rejected_resubmit"},
    "screening_failed": {"screening", "rejected_resubmit"},
    "cleared": set(),
    "released_by_officer": set(),
    "rejected_resubmit": {"screening"},
}


def transition_gate(document: Document, next_state: str) -> None:
    """Apply only an allowed server-side gate transition."""
    current = document.gate_state
    if next_state == current:
        return
    if next_state not in VALID_TRANSITIONS.get(current, set()):
        raise ValueError(f"Invalid gate transition: {current} -> {next_state}")
    document.gate_state = next_state


def screen_document(db: Session, document_id: str, worker_id: str = "local-screening-worker") -> ScreeningReport:
    """Run screening once for the current document version and persist its report."""
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise ValueError(f"Document {document_id} not found.")

    latest = (
        db.query(ScreeningReport)
        .filter(
            ScreeningReport.document_id == document_id,
            ScreeningReport.document_version == document.version,
        )
        .order_by(ScreeningReport.created_at.desc())
        .first()
    )
    if latest:
        return latest

    started = utc_now()
    started_clock = time.perf_counter()
    if document.gate_state in {"quarantined", "screening_failed", "rejected_resubmit"}:
        transition_gate(document, "screening")

    try:
        result = run_screening(Path(document.file_path), declared_mime=document.mime_type)
        finished = utc_now()
        report = ScreeningReport(
            document_id=document.id,
            document_version=document.version,
            checks=result.checks or (result.details or {}).get("checks", []),
            origin_result="no_indicators_found" if result.passed else "check_failed",
            risk_level="low" if result.passed else "high",
            policy_version=settings.GATE_POLICY_VERSION,
            started_at=started,
            finished_at=finished,
            duration_ms=int((time.perf_counter() - started_clock) * 1000),
            worker_id=worker_id,
        )
        db.add(report)
        document.screening_result = {
            **(document.screening_result or {}),
            "checks": report.checks,
            "origin_result": report.origin_result,
        }
        document.screened_at = finished
        if result.sha256:
            document.hash = result.sha256
        if result.file_size:
            document.file_size = result.file_size
        document.file_format = result.file_format or document.file_format
        if result.passed:
            # Origin review remains a separate gate stage.
            transition_gate(document, "cleared")
            document.gate_reason = "File safety screening passed; origin review completed locally."
            document.cleared_at = finished
        else:
            transition_gate(document, "screening_failed")
            document.gate_reason = result.reason
        db.flush()
        return report
    except Exception as exc:
        db.rollback()
        document = db.query(Document).filter(Document.id == document_id).first()
        if document and document.gate_state in {"quarantined", "screening"}:
            document.gate_state = "screening_failed"
            document.gate_reason = "Screening could not be completed. Please upload the original file again."
            db.commit()
        raise RuntimeError("SCREENING_ERROR") from exc
