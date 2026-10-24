import re
from datetime import datetime
from typing import Optional
from sqlalchemy.orm import Session
from app.models import User, Institution, Instrument, PaymentClaim, Document, ReleaseRequest
from app.services.rules_engine import format_currency, calculate_payment_penalty
from app.services.matching_engine import verify_payment_claim

def run_assistant_query(db: Session, user: User, query_text: str) -> dict:
    """
    Implements Flow D - Natural Language Assistant:
    - Maps question to fixed parameterised query
    - Strictly applies user's role and regional/institution scoping
    - Refuses out-of-scope institutions
    - Returns structured answer rows + evidence links
    - Never writes or executes raw SQL
    """
    q = (query_text or "").strip().lower()

    # Base query filters according to RBAC
    def get_scoped_institutions():
        base = db.query(Institution)
        if user.role in ["admin", "head", "finance", "auditor", "committee"]:
            return base.all()
        elif user.role == "scrutiny":
            if user.region_scope:
                return base.filter(Institution.region == user.region_scope).all()
            return base.all()
        elif user.role == "institution":
            return base.filter(Institution.id == user.institution_id).all()
        return []

    scoped_insts = get_scoped_institutions()
    scoped_inst_ids = {i.id for i in scoped_insts}

    today = datetime.now().date()

    # 1. Intent: Maturing FDRs (e.g. "maturing in 30 days", "fdr maturing in next 60 days")
    if "matur" in q:
        match_days = re.search(r'\b(\d+)\b', q)
        window_days = int(match_days.group(1)) if match_days else 30

        instruments = db.query(Instrument).filter(
            Instrument.institution_id.in_(scoped_inst_ids),
            Instrument.status != "released"
        ).all()

        matching_rows = []
        for inst in instruments:
            try:
                mat_dt = datetime.strptime(inst.maturity_date, "%Y-%m-%d").date()
                diff_days = (mat_dt - today).days
                if 0 <= diff_days <= window_days:
                    institution_name = inst.institution.name if inst.institution else inst.institution_id
                    matching_rows.append(
                        f"{inst.reference} · {institution_name} · {format_currency(inst.amount)} · matures {inst.maturity_date} ({diff_days} days remaining)"
                    )
            except ValueError:
                continue

        title = f"FDRs maturing in the next {window_days} days"
        return {
            "title": title,
            "rows": matching_rows if matching_rows else [f"No active FDRs found maturing within {window_days} days in your authorized scope."],
            "evidence_route": "/dashboard",
            "access_denied": False,
            "intent_matched": "MATURITIES",
            "suggested_questions": [
                "Which claims have not been matched to bank statements?",
                "Are there any release requests with missing documents?",
                "Why were payments flagged in my region?"
            ]
        }

    # 2. Intent: Unmatched claims / verification (e.g. "unmatched transactions", "claims not matched")
    if re.search(r"unmatch|not\s+.*match|haven.?t\s+.*match|mismatch|unverified", q):
        claims = db.query(PaymentClaim).filter(PaymentClaim.institution_id.in_(scoped_inst_ids)).all()
        unmatched_rows = []
        for c in claims:
            match_res = c.match_result
            if not match_res:
                match_res = verify_payment_claim(db, c)
            if match_res.classification != "EXACT_MATCH":
                inst_name = c.institution.name if c.institution else c.institution_id
                unmatched_rows.append(
                    f"{inst_name} · UTR: {c.utr} · Claimed: {format_currency(c.amount)} · Status: {match_res.classification} ({match_res.suggested_action})"
                )

        return {
            "title": "Claims not matched exactly to the bank statement",
            "rows": unmatched_rows if unmatched_rows else ["All submitted payment claims in your scope are verified or exactly matched."],
            "evidence_route": "/verify",
            "access_denied": False,
            "intent_matched": "UNMATCHED_TRANSACTIONS",
            "suggested_questions": [
                "Which FDRs are maturing in the next 30 days?",
                "Which release requests are missing required affidavits?"
            ]
        }

    # 3. Intent: Incomplete release requests / missing documents
    if "release" in q:
        requests = db.query(ReleaseRequest).filter(ReleaseRequest.institution_id.in_(scoped_inst_ids)).all()
        release_rows = []
        for r in requests:
            missing = []
            if not r.has_request_letter:
                missing.append("Request Letter")
            if not r.has_affidavit_6:
                missing.append("Affidavit 6")

            inst_name = r.institution.name if r.institution else r.institution_id
            instr_ref = r.instrument.reference if r.instrument else r.instrument_id

            if missing:
                release_rows.append(
                    f"{inst_name} · Ref: {instr_ref} · Status: {r.status} · Missing: {', '.join(missing)}"
                )
            elif r.punitive_blocked:
                release_rows.append(
                    f"{inst_name} · Ref: {instr_ref} · BLOCKED: Institution is under punitive action."
                )
            else:
                release_rows.append(
                    f"{inst_name} · Ref: {instr_ref} · Status: {r.status} · Ready for committee / competent authority action."
                )

        return {
            "title": "Release requests and document completeness status",
            "rows": release_rows if release_rows else ["No pending release requests found in your authorized scope."],
            "evidence_route": "/dashboard",
            "access_denied": False,
            "intent_matched": "RELEASE_REQUESTS",
            "suggested_questions": [
                "Show FDRs maturing in next 60 days",
                "Show unmatched payment claims"
            ]
        }

    # 4. Intent: "Why was X flagged" or "flags"
    if any(k in q for k in ["why", "flag", "discrepanc", "penalty"]):
        # Check if query references a specific institution name
        all_institutions = db.query(Institution).all()
        target_inst = None
        for inst in all_institutions:
            first_word = inst.name.split()[0].lower()
            if first_word in q or inst.id.lower() in q:
                target_inst = inst
                break

        # Check regional/role access
        if target_inst and target_inst.id not in scoped_inst_ids:
            return {
                "title": "Request refused",
                "rows": [f"Access denied: {target_inst.name} is in the {target_inst.region} region, which is outside your authorized scope ({user.region_scope or user.role})."],
                "evidence_route": None,
                "access_denied": True,
                "intent_matched": "ACCESS_DENIED_OUT_OF_SCOPE",
                "suggested_questions": [
                    "What flags exist in my authorized region?",
                    "FDRs maturing in the next 30 days"
                ]
            }

        target_institutions = [target_inst] if target_inst else scoped_insts
        flag_rows = []

        for inst in target_institutions:
            # 1. Unmatched claims
            for c in inst.claims:
                res = c.match_result or verify_payment_claim(db, c)
                if res.classification != "EXACT_MATCH":
                    flag_rows.append(f"{inst.name}: Transaction UTR {c.utr} flagged as {res.classification} ({res.suggested_action}).")

            # 2. Document flags
            for doc in inst.documents:
                for f in doc.flags:
                    flag_rows.append(f"{inst.name}: Document '{doc.file_name}' - {f.field_name} discrepancy: extracted '{f.extracted_value}' vs expected '{f.expected_value}'.")

            # 3. Late payment penalty
            pen = calculate_payment_penalty(inst)
            if pen["penalty_pct"] > 0:
                flag_rows.append(f"{inst.name}: Late payment - {pen['payment_status_text']} ({format_currency(pen['penalty_amount'])} recommended penalty).")

            # 4. Punitive action
            if inst.punitive_flag:
                flag_rows.append(f"{inst.name}: UNDER PUNITIVE ACTION - all deposit release and return operations blocked.")

        title_text = f"Flags for {target_inst.name}" if target_inst else "Flags across your authorized scope"
        return {
            "title": title_text,
            "rows": flag_rows if flag_rows else ["No compliance flags or discrepancy issues found in the selected scope."],
            "evidence_route": "/verify",
            "access_denied": False,
            "intent_matched": "FLAGS_AUDIT",
            "suggested_questions": [
                "Show FDRs maturing in next 30 days",
                "Show unmatched payment claims"
            ]
        }

    # Default fallback
    return {
        "title": "Natural Language Records Assistant",
        "rows": [
            "You can query the portal in plain language for record tracking:",
            "• 'FDRs maturing in the next 30 days' (or 60 / 90 days)",
            "• 'Show claims not matched exactly to the statement'",
            "• 'Which release requests have missing documents?'",
            "• 'Why was [Institution Name] flagged?'"
        ],
        "evidence_route": "/dashboard",
        "access_denied": False,
        "intent_matched": "HELP_GUIDANCE",
        "suggested_questions": [
            "FDRs maturing in the next 30 days",
            "Claims not matched exactly to the statement",
            "Release requests with missing documents",
            "Why are institutions flagged?"
        ]
    }
