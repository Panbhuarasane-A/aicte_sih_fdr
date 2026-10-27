import re

from app.database import SessionLocal
from app.models import Institution, Instrument, PaymentClaim, ReleaseRequest, StatementLine


def test_seed_user_visible_fields_have_no_placeholder_tokens():
    db = SessionLocal()
    try:
        values = []
        for model, fields in (
            (Institution, ("name", "state", "region")),
            (Instrument, ("reference", "bank", "remarks")),
            (PaymentClaim, ("utr", "remarks")),
            (ReleaseRequest, ("reason",)),
            (StatementLine, ("utr", "narration", "source_file")),
        ):
            for row in db.query(model).all():
                values.extend(str(getattr(row, field) or "") for field in fields)
    finally:
        db.close()

    assert not any(re.search(r"MISSING|NOT_FOUND|TEST|DUMMY", value, re.IGNORECASE) for value in values)
