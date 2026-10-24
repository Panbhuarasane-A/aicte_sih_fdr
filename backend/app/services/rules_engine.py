from datetime import datetime, timedelta
from typing import Optional
from app.config import settings
from app.models import Institution

CONCESSION_REGIONS_AND_STATES = {
    "arunachal pradesh", "assam", "manipur", "meghalaya", "mizoram",
    "nagaland", "sikkim", "tripura", "jammu & kashmir", "jammu and kashmir",
    "ladakh", "andaman & nicobar", "andaman and nicobar islands", "lakshadweep"
}

def format_currency(amount: float) -> str:
    """Formats Indian Rupee values with proper commas."""
    s = f"{int(amount)}"
    if len(s) <= 3:
        return f"₹{s}"
    last_three = s[-3:]
    rest = s[:-3]
    parts = []
    while len(rest) > 2:
        parts.insert(0, rest[-2:])
        rest = rest[:-2]
    if rest:
        parts.insert(0, rest)
    return f"₹{','.join(parts)},{last_three}"

def is_concession_eligible(institution: Institution) -> tuple[bool, Optional[str]]:
    """
    Checks Table 1.4 concession eligibility:
    - NE states, J&K, Ladakh, A&N, Lakshadweep
    - Aspirational districts
    - Women-only and PwD-only institutions
    """
    if institution.concession_category:
        return True, institution.concession_category

    if institution.region and institution.region.upper() == "NE":
        return True, "North East Region Concession"

    state_clean = (institution.state or "").strip().lower()
    if state_clean in CONCESSION_REGIONS_AND_STATES:
        return True, f"{institution.state} State/UT Concession"

    return False, None

def calculate_deposit_requirement(
    institution: Institution,
    base_amount: Optional[float] = None,
    concession_factor: Optional[float] = None,
    lease_multiplier: Optional[float] = None
) -> dict:
    base = base_amount if base_amount is not None else settings.DEFAULT_BASE_DEPOSIT
    conc_mult = concession_factor if concession_factor is not None else settings.CONCESSION_MULTIPLIER
    l_mult = lease_multiplier if lease_multiplier is not None else settings.LEASED_LAND_MULTIPLIER

    is_conc, conc_reason = is_concession_eligible(institution)
    actual_conc = conc_mult if is_conc else 1.0

    is_leased = (institution.tenure_type or "").lower() == "leased"
    actual_lease = l_mult if is_leased else 1.0

    total_required = base * actual_conc * actual_lease

    breakdown = (
        f"{format_currency(base)} base"
        f" × {actual_conc} ({conc_reason or 'standard'})"
        f" × {actual_lease} ({'leased land double' if is_leased else 'owned land'})"
        f" = {format_currency(total_required)}"
    )

    return {
        "base_amount": base,
        "concession_factor": actual_conc,
        "concession_category": conc_reason,
        "lease_multiplier": actual_lease,
        "tenure_type": institution.tenure_type,
        "required_deposit": total_required,
        "calculation_breakdown": breakdown
    }

def calculate_payment_penalty(
    institution: Institution,
    paid_date_override: Optional[str] = None,
    required_deposit: Optional[float] = None
) -> dict:
    req_dep = required_deposit
    if req_dep is None:
        req_dep = calculate_deposit_requirement(institution)["required_deposit"]

    intimation_str = institution.intimation_date or "2026-04-01"
    try:
        intim_dt = datetime.strptime(intimation_str, "%Y-%m-%d").date()
    except ValueError:
        intim_dt = datetime.now().date()

    due_dt = intim_dt + timedelta(days=settings.GRACE_DAYS)
    due_str = due_dt.isoformat()

    paid_str = paid_date_override or institution.paid_date or datetime.now().date().isoformat()
    try:
        paid_dt = datetime.strptime(paid_str, "%Y-%m-%d").date()
    except ValueError:
        paid_dt = datetime.now().date()

    year = intim_dt.year
    tier1_deadline = datetime(year, 5, 31).date() # 31 May
    tier2_deadline = datetime(year, 7, 31).date() # 31 July

    if paid_dt <= due_dt:
        return {
            "intimation_date": intimation_str,
            "due_date": due_str,
            "paid_date": paid_str,
            "penalty_pct": 0.0,
            "penalty_amount": 0.0,
            "payment_status_text": "Paid on time (within 15 days of intimation)",
            "eligible_for_withdrawal": False
        }
    elif paid_dt <= tier1_deadline:
        penalty_amount = req_dep * (settings.PENALTY_TIER_1_PCT / 100.0)
        return {
            "intimation_date": intimation_str,
            "due_date": due_str,
            "paid_date": paid_str,
            "penalty_pct": settings.PENALTY_TIER_1_PCT,
            "penalty_amount": penalty_amount,
            "payment_status_text": f"Late: {int(settings.PENALTY_TIER_1_PCT)}% penalty (payment window up to 31 May {year})",
            "eligible_for_withdrawal": False
        }
    elif paid_dt <= tier2_deadline:
        penalty_amount = req_dep * (settings.PENALTY_TIER_2_PCT / 100.0)
        return {
            "intimation_date": intimation_str,
            "due_date": due_str,
            "paid_date": paid_str,
            "penalty_pct": settings.PENALTY_TIER_2_PCT,
            "penalty_amount": penalty_amount,
            "payment_status_text": f"Late: {int(settings.PENALTY_TIER_2_PCT)}% penalty (payment window up to 31 July {year})",
            "eligible_for_withdrawal": False
        }
    else:
        penalty_amount = req_dep * (settings.PENALTY_TIER_2_PCT / 100.0)
        return {
            "intimation_date": intimation_str,
            "due_date": due_str,
            "paid_date": paid_str,
            "penalty_pct": settings.PENALTY_TIER_2_PCT,
            "penalty_amount": penalty_amount,
            "payment_status_text": f"Paid after 31 July {year}: eligible for withdrawal of approval (20% penalty applied)",
            "eligible_for_withdrawal": True
        }
