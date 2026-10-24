from datetime import datetime
from typing import Optional
from sqlalchemy.orm import Session
from rapidfuzz import fuzz
from app.config import settings
from app.models import PaymentClaim, StatementLine, MatchResult, Institution
from app.services.rules_engine import format_currency, calculate_deposit_requirement

def verify_payment_claim(db: Session, claim: PaymentClaim) -> MatchResult:
    """
    Implements Flow A - Payment verification engine:
    Matches claimed payment to statement lines by UTR, amount, date window and payer.
    Results: EXACT_MATCH, POSSIBLE_MATCH, AMOUNT_MISMATCH, MISSING_TRANSACTION, DUPLICATE_CLAIM.
    """
    institution = db.query(Institution).filter(Institution.id == claim.institution_id).first()
    inst_name = institution.name if institution else "Unknown Institution"
    req_dep = calculate_deposit_requirement(institution)["required_deposit"] if institution else 0.0

    # 1. Check for Duplicate Claim: Another claim with same UTR submitted earlier
    duplicate = db.query(PaymentClaim).filter(
        PaymentClaim.utr == claim.utr,
        PaymentClaim.id != claim.id,
        PaymentClaim.created_at < claim.created_at
    ).first()

    if duplicate:
        dup_inst = db.query(Institution).filter(Institution.id == duplicate.institution_id).first()
        dup_name = dup_inst.name if dup_inst else duplicate.institution_id
        classification = "DUPLICATE_CLAIM"
        evidence_lines = [
            f"UTR '{claim.utr}' was already claimed on {duplicate.date} by {dup_name} (Claim ID: {duplicate.id}).",
            f"Original claim amount: {format_currency(duplicate.amount)}."
        ]
        score = 0.0
        rule_ids = ["RULE-MATCH-001-DUPLICATE"]
        suggested_action = "Hold both claims and request formal bank clarification from the institution."

        return _save_or_update_match(db, claim.id, classification, evidence_lines, score, rule_ids, suggested_action)

    # 2. Check Statement for UTR
    statement_line = db.query(StatementLine).filter(StatementLine.utr == claim.utr).first()

    if statement_line:
        if abs(statement_line.amount - claim.amount) < 0.01:
            classification = "EXACT_MATCH"
            diff_text = ""
            if claim.amount < req_dep:
                shortfall = req_dep - claim.amount
                diff_text = f"Shortfall against required deposit: {format_currency(shortfall)} (Required {format_currency(req_dep)}, paid {format_currency(claim.amount)})."
            
            evidence_lines = [
                f"Statement match confirmed: UTR {statement_line.utr} · {format_currency(statement_line.amount)} · Date {statement_line.date}.",
                f"Bank narration: '{statement_line.narration}' in file '{statement_line.source_file}'."
            ]
            if diff_text:
                evidence_lines.append(diff_text)

            score = 1.0
            rule_ids = ["RULE-MATCH-002-EXACT"]
            suggested_action = "Consistent with bank statement; forward for Scrutiny Officer verification."

            return _save_or_update_match(db, claim.id, classification, evidence_lines, score, rule_ids, suggested_action)
        else:
            diff = claim.amount - statement_line.amount
            classification = "AMOUNT_MISMATCH"
            evidence_lines = [
                f"Claimed {format_currency(claim.amount)} vs statement line {format_currency(statement_line.amount)} (Difference {format_currency(diff)}).",
                f"Statement line details: {statement_line.date} · UTR {statement_line.utr} · {statement_line.narration}."
            ]
            score = 0.5
            rule_ids = ["RULE-MATCH-003-AMOUNT-MISMATCH"]
            suggested_action = "Do not accept; request revised proof and bank reconciliation certificate."

            return _save_or_update_match(db, claim.id, classification, evidence_lines, score, rule_ids, suggested_action)

    # 3. If UTR not found in statements, check date window + amount match
    try:
        claim_dt = datetime.strptime(claim.date, "%Y-%m-%d").date()
    except ValueError:
        claim_dt = datetime.now().date()

    candidates = db.query(StatementLine).filter(
        StatementLine.amount == claim.amount
    ).all()

    window_candidates = []
    for cand in candidates:
        try:
            cand_dt = datetime.strptime(cand.date, "%Y-%m-%d").date()
            days_diff = abs((cand_dt - claim_dt).days)
            if days_diff <= settings.STATEMENT_MATCH_WINDOW_DAYS:
                # Fuzzy narration similarity score with institution name
                fuzzy_ratio = fuzz.partial_ratio(inst_name.lower(), cand.narration.lower())
                window_candidates.append((cand, days_diff, fuzzy_ratio))
        except ValueError:
            continue

    if window_candidates:
        # Sort by proximity of days then fuzzy ratio
        window_candidates.sort(key=lambda x: (x[1], -x[2]))
        classification = "POSSIBLE_MATCH"
        evidence_lines = [
            f"UTR '{claim.utr}' not found, but {len(window_candidates)} candidate statement line(s) match amount {format_currency(claim.amount)} within ±{settings.STATEMENT_MATCH_WINDOW_DAYS} days:"
        ]
        for cand, days_diff, ratio in window_candidates[:3]:
            evidence_lines.append(
                f"Candidate UTR {cand.utr} · {format_currency(cand.amount)} · {cand.date} (offset {days_diff}d, narration: '{cand.narration}')"
            )
        score = 0.4
        rule_ids = ["RULE-MATCH-004-POSSIBLE"]
        suggested_action = "Scrutiny Officer to confirm the correct UTR / transaction ID with the remitting bank."

        return _save_or_update_match(db, claim.id, classification, evidence_lines, score, rule_ids, suggested_action)

    # 4. Missing transaction
    classification = "MISSING_TRANSACTION"
    evidence_lines = [
        f"No bank statement line exists for UTR '{claim.utr}' or for amount {format_currency(claim.amount)} within the ±{settings.STATEMENT_MATCH_WINDOW_DAYS} day window.",
        "Bank statement records checked against imported statement feeds."
    ]
    score = 0.0
    rule_ids = ["RULE-MATCH-005-MISSING"]
    suggested_action = "Request fresh stamped bank payment challan, RTGS counterfoil or revised statement."

    return _save_or_update_match(db, claim.id, classification, evidence_lines, score, rule_ids, suggested_action)

def _save_or_update_match(
    db: Session,
    claim_id: str,
    classification: str,
    evidence_lines: list[str],
    score: float,
    rule_ids: list[str],
    suggested_action: str
) -> MatchResult:
    existing = db.query(MatchResult).filter(MatchResult.claim_id == claim_id).first()
    if existing:
        existing.classification = classification
        existing.evidence_lines = evidence_lines
        existing.score = score
        existing.rule_ids = rule_ids
        existing.suggested_action = suggested_action
        db.flush()
        return existing
    else:
        new_result = MatchResult(
            claim_id=claim_id,
            classification=classification,
            evidence_lines=evidence_lines,
            score=score,
            rule_ids=rule_ids,
            suggested_action=suggested_action
        )
        db.add(new_result)
        db.flush()
        return new_result
