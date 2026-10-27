"""Shared display labels for internal assistant values."""

import logging

logger = logging.getLogger(__name__)

LABELS = {
    "MISMATCH_CASES": "Mismatch cases",
    "UNMATCHED_TRANSACTIONS": "Unmatched claims",
    "FLAGS_AUDIT": "Flagged records",
    "RELEASE_REQUESTS": "Release requests",
    "AMOUNT_MISMATCH": "Amount mismatch",
    "REFERENCE_MISMATCH": "Reference mismatch",
    "DATE_MISMATCH": "Date mismatch",
    "POSSIBLE_MATCH": "Possible match",
    "MISSING_TRANSACTION": "Missing transaction",
    "DUPLICATE_CLAIM": "Duplicate claim",
    "EXACT_MATCH": "Consistent with statement",
}


def display_label(value: str) -> str:
    if value in LABELS:
        return LABELS[value]
    if not value:
        return "Not provided"
    logger.warning("Unknown assistant display code: %s", value)
    return value.replace("_", " ").strip().capitalize()
