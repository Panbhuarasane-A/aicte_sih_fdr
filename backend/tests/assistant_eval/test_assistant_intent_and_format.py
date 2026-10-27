from app.database import SessionLocal
from app.models import User
from app.services.assistant_service import run_assistant_query


def test_mismatch_query_selects_narrow_intent_and_requested_outputs():
    db = SessionLocal()
    try:
        officer = db.query(User).filter(User.username == "officer.south").one()
        result = run_assistant_query(
            db,
            officer,
            "Show the top mismatch cases as a graph and give me an Excel sheet.",
        )
    finally:
        db.close()

    assert result["intent_matched"] == "Mismatch cases"
    assert result["intent_code"] == "MISMATCH_CASES"
    assert result["presentation"]["charts"]
    assert result["presentation"]["export"] == "xlsx"
    assert result["table"]["rows"]
    assert all("Delhi" not in row["institution"] for row in result["table"]["rows"])
    assert all("Guwahati" not in row["institution"] for row in result["table"]["rows"])
    assert all("Pune" not in row["institution"] for row in result["table"]["rows"])


def test_mismatch_answer_does_not_expose_internal_intent_code_to_ui():
    """Diagnostic regression: the API still returns the raw tag rendered by Assistant.jsx."""
    db = SessionLocal()
    try:
        officer = db.query(User).filter(User.username == "officer.south").one()
        result = run_assistant_query(
            db,
            officer,
            "Show the top mismatch cases as a graph and give me an Excel sheet.",
        )
    finally:
        db.close()

    assert result["intent_matched"] == "Mismatch cases"
