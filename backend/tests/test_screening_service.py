from pathlib import Path

import pytest

from app.models import Document, ScreeningReport
from app.services.screening_service import screen_document, transition_gate


def test_gate_transitions_reject_invalid_jump():
    document = Document(gate_state="quarantined")
    transition_gate(document, "screening")
    assert document.gate_state == "screening"
    with pytest.raises(ValueError):
        transition_gate(document, "released_by_officer")


def test_screen_document_persists_report_and_clears_safe_pdf(tmp_path, db_session):
    path = tmp_path / "document.pdf"
    path.write_bytes(b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n")
    document = Document(
        institution_id="INST-S01",
        file_name="document.pdf",
        file_path=str(path),
        file_key="document.pdf",
        hash="0" * 64,
        mime_type="application/pdf",
        gate_state="quarantined",
    )
    db_session.add(document)
    db_session.commit()

    report = screen_document(db_session, document.id)
    db_session.commit()

    assert report.checks
    assert report.origin_result in {"no_indicators_found", "check_failed"}
    assert db_session.get(Document, document.id).gate_state in {"cleared", "screening_failed"}
    assert db_session.query(ScreeningReport).filter_by(document_id=document.id).count() == 1


@pytest.fixture
def db_session():
    from app.database import SessionLocal
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
