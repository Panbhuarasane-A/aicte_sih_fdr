from app.services.fdr_foundation import (
    amount_words_to_paise,
    hash_identifier,
    mask_identifier,
    normalize_fields,
    paise_to_words,
    validate_fields,
)


def test_amount_words_supports_indian_scales():
    assert amount_words_to_paise("Ten Lakh Rupees Only") == 100000000
    assert amount_words_to_paise("One Crore Five Lakh Rupees Only") == 1050000000
    assert amount_words_to_paise("Ten Lakh Rupees and 50 Paise") == 100000050


def test_paise_to_words_is_round_trippable_for_integer_rupees():
    words = paise_to_words(100000000)
    assert words == "Ten Lakh Rupees Only"
    assert amount_words_to_paise(words) == 100000000


def test_normalize_fields_preserves_provenance_and_schema():
    fields = normalize_fields({
        "bank_ifsc": "sbin0000691",
        "deposit_amount_paise": "100000000",
        "source_only": "not included",
    })
    assert fields["bank_ifsc"].value == "SBIN0000691"
    assert fields["deposit_amount_paise"].value == 100000000
    assert "source_only" not in fields
    assert fields["fdr_number"].value is None


def test_validation_uses_supplied_policy_and_explainable_evidence():
    fields = {
        "deposit_amount_paise": 100000000,
        "amount_in_words": "Eight Lakh Rupees Only",
        "issue_date": "2026-03-12",
        "maturity_date": "2027-03-12",
        "tenure_days": 365,
        "bank_ifsc": "SBIN0000691",
    }
    checks = validate_fields(fields, {"required_fields": ["fdr_number"]})
    assert {check["rule_id"] for check in checks} >= {
        "AMOUNT_WORDS_DIGITS", "DATE_ORDER", "TENURE_DAYS", "IFSC_FORMAT", "REQUIRED_FIELD"
    }
    assert next(check for check in checks if check["rule_id"] == "AMOUNT_WORDS_DIGITS")["status"] == "fail"
    assert next(check for check in checks if check["rule_id"] == "REQUIRED_FIELD")["evidence"]["field"] == "fdr_number"


def test_identifiers_are_masked_and_salted():
    assert mask_identifier("ABCDE1234F") == "******234F"
    assert hash_identifier("abc 123", "salt-a") != hash_identifier("abc 123", "salt-b")
    assert hash_identifier("abc 123", "salt-a") == hash_identifier("ABC123", "salt-a")
