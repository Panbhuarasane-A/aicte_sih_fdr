from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Instrument, Institution, PaymentClaim, ReleaseRequest, Document, User
from app.schemas import DashboardKPIs
from app.security import get_current_user
from app.services.matching_engine import verify_payment_claim
from app.services.rules_engine import calculate_payment_penalty, calculate_deposit_requirement
from app.services.report_service import generate_csv_report

router = APIRouter(prefix="", tags=["Dashboard & Reports"])

@router.get("/dashboard/summary", response_model=DashboardKPIs)
def get_dashboard_summary(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query_inst = db.query(Institution)
    if current_user.role == "institution":
        if current_user.institution_id:
            query_inst = query_inst.filter(Institution.id == current_user.institution_id)
        else:
            query_inst = query_inst.filter(Institution.id == "NONE")
    elif current_user.role == "scrutiny":
        if current_user.region_scope:
            query_inst = query_inst.filter(Institution.region == current_user.region_scope)

    institutions = query_inst.all()
    scoped_inst_ids = {i.id for i in institutions}

    instruments = db.query(Instrument).filter(Instrument.institution_id.in_(scoped_inst_ids)).all()
    claims = db.query(PaymentClaim).filter(PaymentClaim.institution_id.in_(scoped_inst_ids)).all()
    release_requests = db.query(ReleaseRequest).filter(ReleaseRequest.institution_id.in_(scoped_inst_ids)).all()

    today = datetime.now().date()

    active_cnt = 0
    expiring_soon_cnt = 0
    matured_cnt = 0
    renewed_cnt = 0
    released_cnt = 0
    total_val = 0.0

    for i in instruments:
        total_val += i.amount
        if i.status == "renewed":
            renewed_cnt += 1
        elif i.status == "released":
            released_cnt += 1
        else:
            try:
                mat_dt = datetime.strptime(i.maturity_date, "%Y-%m-%d").date()
                diff = (mat_dt - today).days
                if diff < 0:
                    matured_cnt += 1
                elif diff <= 30:
                    expiring_soon_cnt += 1
                else:
                    active_cnt += 1
            except Exception:
                active_cnt += 1

    pending_claims_cnt = sum(1 for c in claims if c.officer_decision == "PENDING")

    flagged_claims_cnt = 0
    shortfall_total = 0.0
    for c in claims:
        res = c.match_result or verify_payment_claim(db, c)
        if res.classification != "EXACT_MATCH":
            flagged_claims_cnt += 1
        else:
            req_dep = calculate_deposit_requirement(c.institution)["required_deposit"] if c.institution else 0.0
            if c.amount < req_dep:
                shortfall_total += (req_dep - c.amount)

    penalty_cases_cnt = 0
    for inst in institutions:
        pen = calculate_payment_penalty(inst)
        if pen["penalty_pct"] > 0:
            penalty_cases_cnt += 1

    pending_release_cnt = sum(1 for r in release_requests if r.status in ["SUBMITTED", "IN_SCRUTINY", "RECOMMENDED"])

    total_claims = len(claims)
    accuracy_pct = 100.0
    if total_claims > 0:
        exact_count = total_claims - flagged_claims_cnt
        accuracy_pct = round((exact_count / total_claims) * 100.0, 1)

    return DashboardKPIs(
        active_fdrs=active_cnt,
        expiring_soon_30_days=expiring_soon_cnt,
        matured_fdrs=matured_cnt,
        renewed_fdrs=renewed_cnt,
        released_fdrs=released_cnt,
        release_requests_pending=pending_release_cnt,
        flagged_claims=flagged_claims_cnt,
        penalty_cases=penalty_cases_cnt,
        total_deposit_value=total_val,
        shortfall_total=shortfall_total,
        record_accuracy_pct=accuracy_pct
    )

@router.get("/reports/{report_type}")
def download_report(
    report_type: str,
    format: str = "csv",
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query_inst = db.query(Institution)
    if current_user.role == "institution":
        if current_user.institution_id:
            query_inst = query_inst.filter(Institution.id == current_user.institution_id)
        else:
            query_inst = query_inst.filter(Institution.id == "NONE")
    elif current_user.role == "scrutiny":
        if current_user.region_scope:
            query_inst = query_inst.filter(Institution.region == current_user.region_scope)

    scoped_inst_ids = {i.id for i in query_inst.all()}

    csv_data = generate_csv_report(report_type, db, scoped_inst_ids)

    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=aicte_{report_type}_{datetime.now().strftime('%Y%m%d')}.csv"}
    )
