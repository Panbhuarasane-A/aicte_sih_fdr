import os
import re
import time
import logging
from datetime import datetime
from typing import Optional
from sqlalchemy.orm import Session
from app.models import User, Institution, Instrument, PaymentClaim, StatementLine, Document, ReleaseRequest, CLEARED_GATE_STATES
from app.models import AssistantResult
from app.services.rules_engine import format_currency, calculate_payment_penalty
from app.services.matching_engine import verify_payment_claim
from app.assistant.labels import display_label

logger = logging.getLogger(__name__)

# In-memory query cache: {cache_key: (timestamp, result_dict)}
_QUERY_CACHE = {}
_CACHE_TTL_SECONDS = 600  # 10 minutes

_cached_gemini_model = None


def parse_presentation(query_text: str) -> dict:
    text = (query_text or "").lower()
    chart = None
    if re.search(r"\b(line|over time)\b", text) or "வரைபட" in text:
        chart = "line"
    elif re.search(r"\b(pie|donut)\b", text):
        chart = "donut"
    elif re.search(r"\b(graph|chart|bar)\b|வரைபட|ग्राफ|चार्ट", text):
        chart = "bar"
    export = "xlsx" if re.search(r"\b(excel|xlsx|spreadsheet|sheet)\b|எக்செல்|एक्सेल", text) else None
    if re.search(r"\bcsv\b|comma[- ]separated", text):
        export = "csv"
    return {"charts": [chart] if chart else [], "table": True, "export": export}

def _get_gemini_model():
    """
    Lazily initialize and reuse the Gemini generative model with optimized generation config.
    """
    global _cached_gemini_model
    if _cached_gemini_model is not None:
        return _cached_gemini_model

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return None

    try:
        import google.generativeai as genai
        genai.configure(api_key=api_key)
        _cached_gemini_model = genai.GenerativeModel(
            "gemini-2.5-flash",
            generation_config={
                "max_output_tokens": 120,
                "temperature": 0.2,
            }
        )
        return _cached_gemini_model
    except Exception as e:
        logger.warning(f"Could not initialize Gemini model: {e}")
        return None

def _synthesize_with_gemini(query: str, title: str, rows: list[str], role: str, intent: str) -> Optional[str]:
    """
    Synthesize an executive response using Gemini while preserving deterministic grounding.
    """
    model = _get_gemini_model()
    if not model:
        return None
    try:
        records_text = "\n".join(f"- {r}" for r in rows[:10]) if rows else "No records found matching this criterion."

        prompt = f"""You are the official AICTE Security Deposit & FDR Regulatory Assistant.
Officer Role: '{role}'
Question: '{query}'
Scope/Category: '{title}' (Intent: {intent})

Verified Records Retrieved from Authorized Database Scope:
{records_text}

Instructions:
1. Provide a professional, concise executive response (2-3 sentences).
2. Base all statements strictly on the verified records above.
3. Explicitly mention specific amounts, UTR numbers, institution names, or deadlines when present.
4. Never invent or hallucinate numbers or verification outcomes. If no records match, state that clearly.
5. Emphasize that all outputs reflect current database evidence and are subject to officer scrutiny."""

        resp = model.generate_content(prompt)
        if resp and resp.text:
            return resp.text.strip()
    except Exception as e:
        logger.warning(f"Gemini synthesis unavailable: {e}")
    return None

def _resolve_query_records(db: Session, user: User, query_text: str) -> dict:
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
    presentation = parse_presentation(query_text)

    # "Mismatch" is the narrow glossary term; it must not fall through to
    # the wider unmatched-claims intent.
    if re.search(r"\bmismatch(?:es)?\b|amount mismatch|reference mismatch|date mismatch", q):
        records = []
        for claim in db.query(PaymentClaim).filter(PaymentClaim.institution_id.in_(scoped_inst_ids)).all():
            match = claim.match_result or verify_payment_claim(db, claim)
            if match.classification not in {"AMOUNT_MISMATCH", "REFERENCE_MISMATCH", "DATE_MISMATCH"}:
                continue
            statement = db.query(StatementLine).filter(StatementLine.utr == claim.utr).first()
            statement_amount = statement.amount if statement else None
            difference = abs(claim.amount - statement_amount) if statement_amount is not None else claim.amount
            records.append({
                "institution": claim.institution.name if claim.institution else claim.institution_id,
                "state": claim.institution.state if claim.institution else "Not provided",
                "utr": claim.utr or "Not provided",
                "claimed": claim.amount,
                "statement": statement_amount,
                "difference": difference,
                "status": display_label(match.classification),
                "suggested_review_step": match.suggested_action,
                "case_link": f"/verify?claim_id={claim.id}",
            })
        records.sort(key=lambda item: item["difference"], reverse=True)
        top_match = re.search(r"\btop\s+(\d+)\b", q)
        limit = int(top_match.group(1)) if top_match else 10
        records = records[:limit]
        return {
            "title": "Mismatch cases",
            "rows": [f"{item['institution']} · {item['status']} · {format_currency(item['difference'])} difference" for item in records] or ["No mismatch cases were found in your authorized scope."],
            "records": records,
            "presentation": presentation,
            "evidence_route": "/verify",
            "access_denied": False,
            "intent_matched": "MISMATCH_CASES",
            "suggested_questions": ["Show all unmatched claims", "Show mismatch cases as a table"],
        }

    # Basic-mode glossary rule: an institution is unpaid when no paid date is
    # recorded. This is evaluated only inside the already-scoped institutions.
    if re.search(r"\bunpaid\b|not\s+paid|still\s+not\s+paid", q):
        unpaid = [inst for inst in scoped_insts if not inst.paid_date]
        rows = [
            f"{inst.name} · {inst.state} · payment status: pending"
            for inst in unpaid
        ]
        return {
            "title": "Institutions with unpaid deposits",
            "rows": rows or ["No institutions with unpaid deposits were found in your authorized scope."],
            "evidence_route": "/dashboard",
            "access_denied": False,
            "intent_matched": "UNPAID_DEPOSITS",
            "suggested_questions": ["Show flagged FDRs in Tamil Nadu", "Which FDRs mature in 30 days?"],
        }

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

        state_names = {inst.state.lower() for inst in scoped_insts}
        requested_state = next((state for state in state_names if state in q), None)
        target_institutions = [target_inst] if target_inst else [
            inst for inst in scoped_insts
            if not requested_state or inst.state.lower() == requested_state
        ]
        flag_rows = []

        for inst in target_institutions:
            # 1. Unmatched claims
            for c in inst.claims:
                res = c.match_result or verify_payment_claim(db, c)
                if res.classification != "EXACT_MATCH":
                    flag_rows.append(f"{inst.name}: Transaction UTR {c.utr} flagged as {res.classification} ({res.suggested_action}).")

            # 2. Document flags — GATE GUARD: only expose fields for cleared documents
            for doc in inst.documents:
                if doc.gate_state not in CLEARED_GATE_STATES:
                    # Document is held or not yet cleared — do not expose any extracted fields
                    if doc.gate_state in ("held", "screening"):
                        flag_rows.append(
                            f"{inst.name}: Document '{doc.file_name}' is held for review "
                            f"(status: {doc.gate_state}, uploaded: {doc.uploaded_at.date() if doc.uploaded_at else 'unknown'}). "
                            "Extracted content is not available until the document is cleared."
                        )
                    continue
                for f in doc.flags:
                    flag_rows.append(f"{inst.name}: Document '{doc.file_name}' - {f.field_name} discrepancy: extracted '{f.extracted_value}' vs expected '{f.expected_value}'.")

            # 3. Late payment penalty
            pen = calculate_payment_penalty(inst)
            if pen["penalty_pct"] > 0:
                flag_rows.append(f"{inst.name}: Late payment - {pen['payment_status_text']} ({format_currency(pen['penalty_amount'])} recommended penalty).")

            # 4. Punitive action
            if inst.punitive_flag:
                flag_rows.append(f"{inst.name}: UNDER PUNITIVE ACTION - all deposit release and return operations blocked.")

        title_text = (
            f"Flags for {target_inst.name}" if target_inst
            else f"Flags in {requested_state.title()}" if requested_state
            else "Flags across your authorized scope"
        )
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

def run_assistant_query(db: Session, user: User, query_text: str) -> dict:
    """
    Executes role-scoped deterministic query and synthesizes conversational
    answer using Gemini if available. Caches response for fast repeat queries.
    """
    cache_key = f"{user.role}:{user.region_scope or 'ALL'}:{user.institution_id or 'NONE'}:{query_text.strip().lower()}"
    now = time.time()

    if cache_key in _QUERY_CACHE:
        cached_time, cached_res = _QUERY_CACHE[cache_key]
        if (now - cached_time) < _CACHE_TTL_SECONDS:
            return dict(cached_res)

    res = _resolve_query_records(db, user, query_text)

    rows = res.get("rows", [])
    meaningful_rows = [row for row in rows if not row.startswith("No ") and not row.startswith("All ")]
    scope_text = (
        f"Institution {user.institution_id}" if user.role == "institution"
        else f"Scrutiny Officer, {user.region_scope}" if user.region_scope
        else "Your authorized officer scope"
    )
    result_id = str(__import__("uuid").uuid4())
    intent_code = res.get("intent_matched", "UNKNOWN")
    payload = {
        "title": res.get("title", "Assistant result"),
        "rows": rows,
        "evidence_route": res.get("evidence_route"),
        "intent_code": intent_code,
        "intent_matched": display_label(intent_code),
        "access_denied": res.get("access_denied", False),
        "suggested_questions": res.get("suggested_questions", []),
        "presentation": res.get("presentation", {"charts": [], "table": True, "export": None}),
    }
    payload["interpretation"] = {
        "text": f"Showing {res.get('title', 'records').lower()} within {scope_text}.",
        "filters": [],
        "scope_text": scope_text,
        "glossary_refs": [],
    }
    payload["summary_text"] = (
        "No records matched the requested criteria."
        if not meaningful_rows else
        f"{len(meaningful_rows)} record{'s' if len(meaningful_rows) != 1 else ''} returned from the authorized data scope."
    )
    payload["kpis"] = [{"label": "Records returned", "value": len(meaningful_rows)}]
    records = res.get("records")
    if records and len(records) == 1:
        payload["charts"] = [{
            "type": "grouped_bar",
            "title": "Claimed versus statement amount",
            "x": "Amount",
            "y": "INR",
            "series": [
                {"label": "Claimed", "value": records[0]["claimed"]},
                {"label": "Statement", "value": records[0]["statement"] or 0},
            ],
            "note": "The table is the source of truth.",
        }]
    else:
        payload["charts"] = [] if not meaningful_rows else [{
            "type": payload["presentation"]["charts"][0] if payload["presentation"]["charts"] else "bar",
            "title": "Records returned",
            "x": "Result",
            "y": "Count",
            "series": [{"label": "Matching records", "value": len(meaningful_rows)}],
            "note": "The table is the source of truth.",
        }]
    if records:
        columns = [
            {"key": "institution", "label": "Institution", "type": "text"},
            {"key": "state", "label": "State", "type": "text"},
            {"key": "utr", "label": "UTR", "type": "text"},
            {"key": "claimed", "label": "Claimed", "type": "currency"},
            {"key": "statement", "label": "Statement", "type": "currency"},
            {"key": "difference", "label": "Difference", "type": "currency"},
            {"key": "status", "label": "Status", "type": "text"},
            {"key": "suggested_review_step", "label": "Suggested review step", "type": "text"},
            {"key": "case_link", "label": "Case", "type": "link"},
        ]
        table_rows = records
    else:
        columns = [{"key": "details", "label": "Details", "type": "text"}]
        table_rows = [{"details": row} for row in meaningful_rows]
    payload["table"] = {
        "columns": columns,
        "rows": table_rows,
        "total_rows": len(table_rows),
        "truncated": False,
    }
    payload["presentation"]["export"] = payload["presentation"].get("export")
    payload["data_as_of"] = datetime.utcnow().isoformat()
    snapshot = AssistantResult(
        id=result_id,
        owner_id=user.id,
        question=query_text,
        scope_text=scope_text,
        mode="basic",
        payload=payload,
    )
    db.add(snapshot)
    db.flush()
    res.update(payload)
    res.update({
        "result_id": result_id,
        "mode": "basic",
        "intent_code": intent_code,
        "intent_matched": display_label(intent_code),
        "ai_summary": None,
        "gemini_powered": False,
        "export": {"available": bool(meaningful_rows), "formats": ["xlsx", "csv"]},
        "warnings": ["Basic mode is active; results are generated by the server rule set."],
    })

    # Store in memory cache
    _QUERY_CACHE[cache_key] = (now, dict(res))
    return res
