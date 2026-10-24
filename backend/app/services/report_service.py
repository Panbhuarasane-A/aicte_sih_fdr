import csv
import io
from datetime import datetime
from typing import List, Any
from sqlalchemy.orm import Session
from app.models import PaymentClaim, Instrument, Institution, ReleaseRequest, AuditLog
from app.services.rules_engine import format_currency, calculate_payment_penalty
from app.services.matching_engine import verify_payment_claim

def generate_csv_report(report_type: str, db: Session, scoped_inst_ids: set[str]) -> str:
    output = io.StringIO()
    writer = csv.writer(output)

    if report_type == "pending-verifications":
        writer.writerow(["Institution ID", "Institution Name", "UTR", "Amount (INR)", "Date", "Matching Status", "Officer Decision", "Suggested Action"])
        claims = db.query(PaymentClaim).filter(PaymentClaim.institution_id.in_(scoped_inst_ids)).all()
        for c in claims:
            res = c.match_result or verify_payment_claim(db, c)
            inst_name = c.institution.name if c.institution else ""
            writer.writerow([c.institution_id, inst_name, c.utr, c.amount, c.date, res.classification, c.officer_decision, res.suggested_action])

    elif report_type == "upcoming-maturities":
        writer.writerow(["Institution ID", "Institution Name", "Reference", "Bank", "Amount (INR)", "Issue Date", "Maturity Date", "Days Remaining", "Status"])
        instruments = db.query(Instrument).filter(Instrument.institution_id.in_(scoped_inst_ids)).all()
        today = datetime.now().date()
        for i in instruments:
            try:
                mat_dt = datetime.strptime(i.maturity_date, "%Y-%m-%d").date()
                diff = (mat_dt - today).days
            except Exception:
                diff = 0
            inst_name = i.institution.name if i.institution else ""
            writer.writerow([i.institution_id, inst_name, i.reference, i.bank, i.amount, i.issue_date, i.maturity_date, diff, i.status])

    elif report_type == "penalty-cases":
        writer.writerow(["Institution ID", "Institution Name", "Region", "Intimation Date", "Paid Date", "Penalty Pct", "Penalty Amount (INR)", "Withdrawal Eligible", "Status Note"])
        institutions = db.query(Institution).filter(Institution.id.in_(scoped_inst_ids)).all()
        for inst in institutions:
            pen = calculate_payment_penalty(inst)
            if pen["penalty_pct"] > 0:
                writer.writerow([
                    inst.id, inst.name, inst.region, pen["intimation_date"], pen["paid_date"],
                    f"{pen['penalty_pct']}%", pen["penalty_amount"],
                    "YES" if pen["eligible_for_withdrawal"] else "NO",
                    pen["payment_status_text"]
                ])

    elif report_type == "audit-trail":
        writer.writerow(["Timestamp", "Actor ID", "Actor Name", "Actor Role", "Action", "Entity Type", "Entity ID", "Current Hash", "Previous Hash"])
        logs = db.query(AuditLog).order_by(AuditLog.timestamp.desc()).all()
        for l in logs:
            writer.writerow([l.timestamp.isoformat(), l.actor_id, l.actor_name, l.actor_role, l.action, l.entity_type, l.entity_id, l.hash, l.previous_hash])

    else:
        # Default summary
        writer.writerow(["Report", "Generated At", "Scope Count"])
        writer.writerow([report_type, datetime.now().isoformat(), len(scoped_inst_ids)])

    return output.getvalue()
