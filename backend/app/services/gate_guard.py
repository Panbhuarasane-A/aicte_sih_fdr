"""
gate_guard.py — Single enforcement point for the document origin gate.

IMPORTANT: This function MUST be called before any code path that reads
extracted text, extracted fields, raw_text, page_regions, or document
previews.  The test suite has a security test that verifies no new code
path bypasses it.

Allowed gate states that permit text/field access:
    cleared | released_by_officer
"""
from fastapi import HTTPException, status
from app.models import CLEARED_GATE_STATES


def require_gate_cleared(document) -> None:
    """
    Raises HTTP 409 GATE_NOT_CLEARED if the document has not been cleared
    by the gate (either automatically or by an officer).

    Callers: extract endpoint, comparison step, assistant tools, preview,
    export, and any other path that reads document text or extracted fields.

    Args:
        document: A Document ORM instance (must have .gate_state attribute).

    Raises:
        HTTPException 409 with code GATE_NOT_CLEARED if not cleared.
    """
    if document.gate_state not in CLEARED_GATE_STATES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "GATE_NOT_CLEARED",
                "message": (
                    "This document has not been cleared for text extraction. "
                    f"Current gate state: {document.gate_state}."
                ),
                "gate_state": document.gate_state,
            },
        )
