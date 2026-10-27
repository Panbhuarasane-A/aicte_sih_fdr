"""Pure FDR field normalization and validation helpers.

These helpers deliberately operate on supplied values only. They do not read
files, infer missing fields, or decide whether a document passed the origin
gate.
"""
from __future__ import annotations

import hashlib
import hmac
import re
from dataclasses import dataclass
from datetime import date
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any, Mapping, Optional, Sequence

from app.config import settings


FDR_FIELD_NAMES = (
    "doc_type",
    "bank_name",
    "branch",
    "bank_ifsc",
    "fdr_number",
    "institution_name",
    "institution_aicte_id",
    "depositor_pan_masked",
    "customer_id_masked",
    "deposit_amount_paise",
    "amount_in_words",
    "issue_date",
    "tenure_days",
    "maturity_date",
    "interest_rate_pct",
    "interest_type",
    "maturity_value_paise",
    "utr_normalized",
    "payment_mode",
    "remitting_account_last4",
    "lien_holder",
    "purpose",
    "status_text",
    "is_synthetic_demo",
)

ORIGIN_LABELS = {
    "no_indicators_found",
    "inconclusive",
    "indicators_present",
    "check_failed",
}


@dataclass(frozen=True)
class FDRField:
    name: str
    value: Any = None
    confidence: Optional[float] = None
    source: str = "rule"
    bbox: Optional[tuple[float, float, float, float]] = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "value": self.value,
            "confidence": self.confidence,
            "source": self.source,
            "bbox": list(self.bbox) if self.bbox is not None else None,
        }


def normalize_fields(fields: Mapping[str, Any] | Sequence[FDRField]) -> dict[str, FDRField]:
    """Return the known schema fields with normalized values and provenance."""
    if isinstance(fields, Mapping):
        source_fields = {
            key: value if isinstance(value, FDRField) else FDRField(name=key, value=value)
            for key, value in fields.items()
        }
    else:
        source_fields = {field.name: field for field in fields}

    normalized: dict[str, FDRField] = {}
    for name in FDR_FIELD_NAMES:
        field = source_fields.get(name, FDRField(name=name))
        value = _normalize_value(name, field.value)
        normalized[name] = FDRField(
            name=name,
            value=value,
            confidence=field.confidence,
            source=field.source if field.source in {"rule", "ocr"} else "rule",
            bbox=field.bbox,
        )
    return normalized


def amount_words_to_paise(text: str) -> Optional[int]:
    """Convert common Indian/English amount wording to integer paise."""
    if not text or not text.strip():
        return None
    normalized = re.sub(r"[^a-z0-9. ]", " ", text.lower()).replace("  ", " ").strip()
    normalized = re.sub(r"\bonly\b", "", normalized).strip()
    if re.fullmatch(r"\d+(?:\.\d{1,2})?", normalized):
        return _decimal_to_paise(Decimal(normalized))

    tokens = normalized.replace("-", " ").split()
    number_words = {
        "zero": 0, "one": 1, "two": 2, "three": 3, "four": 4,
        "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9,
        "ten": 10, "eleven": 11, "twelve": 12, "thirteen": 13,
        "fourteen": 14, "fifteen": 15, "sixteen": 16, "seventeen": 17,
        "eighteen": 18, "nineteen": 19,
    }
    tens = {
        "twenty": 20, "thirty": 30, "forty": 40, "fifty": 50,
        "sixty": 60, "seventy": 70, "eighty": 80, "ninety": 90,
    }
    scales = {"hundred": 100, "thousand": 1_000, "lakh": 100_000, "crore": 10_000_000}
    whole = 0
    current = 0
    decimal_tokens: list[str] = []
    if "paise" in tokens:
        index = tokens.index("paise")
        decimal_tokens = tokens[index - 1:index]
        tokens = tokens[:index - 1]
    if "rupees" in tokens:
        tokens = tokens[:tokens.index("rupees")]
    if "and" in tokens:
        tokens = [token for token in tokens if token != "and"]
    if not tokens:
        return None

    for token in tokens:
        if token in number_words:
            current += number_words[token]
        elif token in tens:
            current += tens[token]
        elif token == "hundred":
            current = max(current, 1) * 100
        elif token in scales:
            whole += current * scales[token]
            current = 0
        else:
            return None
    whole += current

    paise = 0
    if decimal_tokens:
        decimal = decimal_tokens[0]
        if decimal.isdigit():
            paise = int(decimal[:2].ljust(2, "0"))
        elif decimal in number_words:
            paise = number_words[decimal] * 10
        else:
            return None
    return whole * 100 + paise


def paise_to_words(paise: int) -> str:
    """Render paise using Indian scale words without inventing decimals."""
    if not isinstance(paise, int) or paise < 0:
        raise ValueError("paise must be a non-negative integer")
    rupees, remainder = divmod(paise, 100)
    words = _number_to_indian_words(rupees) or "Zero"
    if remainder:
        return f"{words} Rupees and {remainder:02d} Paise"
    return f"{words} Rupees Only"


def mask_identifier(value: Optional[str], visible_suffix: int = 4) -> Optional[str]:
    if value is None:
        return None
    compact = re.sub(r"\s+", "", str(value))
    if not compact:
        return None
    suffix = compact[-visible_suffix:]
    return f"{'*' * max(len(compact) - visible_suffix, 0)}{suffix}"


def hash_identifier(value: Optional[str], salt: Optional[str] = None) -> Optional[str]:
    if value is None or not str(value).strip():
        return None
    secret = (salt or settings.IDENTIFIER_HASH_SALT).encode("utf-8")
    normalized = re.sub(r"\s+", "", str(value)).upper().encode("utf-8")
    return hmac.new(secret, normalized, hashlib.sha256).hexdigest()


def validate_fields(
    fields: Mapping[str, Any] | Sequence[FDRField],
    rules: Optional[Mapping[str, Any]] = None,
) -> list[dict[str, Any]]:
    """Return explainable checks using only caller-provided policy rules."""
    normalized = normalize_fields(fields)
    policy = rules or {}
    checks: list[dict[str, Any]] = []

    amount = normalized["deposit_amount_paise"].value
    amount_words = normalized["amount_in_words"].value
    if amount is not None and amount_words:
        words_amount = amount_words_to_paise(amount_words)
        checks.append(_check(
            "AMOUNT_WORDS_DIGITS",
            "pass" if words_amount == amount else "fail",
            {"digits_paise": amount, "words_paise": words_amount},
        ))

    issue = _parse_date(normalized["issue_date"].value)
    maturity = _parse_date(normalized["maturity_date"].value)
    if issue and maturity:
        checks.append(_check(
            "DATE_ORDER",
            "pass" if issue < maturity else "fail",
            {"issue_date": issue.isoformat(), "maturity_date": maturity.isoformat()},
        ))
        tenure = normalized["tenure_days"].value
        if tenure is not None:
            checks.append(_check(
                "TENURE_DAYS",
                "pass" if (maturity - issue).days == tenure else "fail",
                {"expected_days": (maturity - issue).days, "supplied_days": tenure},
            ))

    if normalized["bank_ifsc"].value:
        value = str(normalized["bank_ifsc"].value).upper()
        checks.append(_check("IFSC_FORMAT", "pass" if re.fullmatch(r"[A-Z]{4}0[A-Z0-9]{6}", value) else "fail", {"value": value}))
    if normalized["depositor_pan_masked"].value:
        raw = str(normalized["depositor_pan_masked"].value).replace("*", "A")
        checks.append(_check("PAN_FORMAT", "pass" if re.fullmatch(r"[A-Z]{5}[0-9]{4}[A-Z]", raw.upper()) else "info", {"masked": normalized["depositor_pan_masked"].value}))

    required = policy.get("required_fields", ())
    for field_name in required:
        if field_name in normalized and normalized[field_name].value in (None, ""):
            checks.append(_check("REQUIRED_FIELD", "fail", {"field": field_name}))
    return checks


def _normalize_value(name: str, value: Any) -> Any:
    if value in ("", None):
        return None
    if name in {"deposit_amount_paise", "maturity_value_paise", "tenure_days"}:
        try:
            return int(value)
        except (TypeError, ValueError):
            return value
    if name == "interest_rate_pct":
        try:
            return float(value)
        except (TypeError, ValueError):
            return value
    if name == "is_synthetic_demo":
        return bool(value)
    if name in {"bank_ifsc", "utr_normalized", "payment_mode"}:
        return str(value).strip().upper()
    return str(value).strip() if isinstance(value, str) else value


def _decimal_to_paise(value: Decimal) -> int:
    return int((value * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def _parse_date(value: Any) -> Optional[date]:
    if not value:
        return None
    try:
        return date.fromisoformat(str(value))
    except ValueError:
        return None


def _check(rule_id: str, status: str, evidence: dict[str, Any]) -> dict[str, Any]:
    return {"rule_id": rule_id, "status": status, "evidence": evidence}


def _number_to_indian_words(number: int) -> str:
    if number == 0:
        return "Zero"
    ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
            "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen",
            "Eighteen", "Nineteen"]
    tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]

    def under_thousand(value: int) -> str:
        parts = []
        if value >= 100:
            parts.extend([ones[value // 100], "Hundred"])
            value %= 100
        if value >= 20:
            parts.append(tens[value // 10])
            value %= 10
        if value:
            parts.append(ones[value])
        return " ".join(parts)

    parts = []
    for scale, label in ((10_000_000, "Crore"), (100_000, "Lakh"), (1_000, "Thousand"), (1, "")):
        quotient, number = divmod(number, scale)
        if quotient:
            parts.append(under_thousand(quotient))
            if label:
                parts.append(label)
    return " ".join(parts)
