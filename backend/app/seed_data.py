from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.models import (
    User, Institution, Instrument, StatementLine, PaymentClaim,
    ReleaseRequest, WorkflowStep, RulesConfig, AuditLog
)
from app.security import get_password_hash
from app.services.matching_engine import verify_payment_claim
from app.services.audit_service import log_audit, compute_block_hash, GENESIS_HASH

def seed_database(db: Session):
    # Check if database is already seeded
    if db.query(User).first():
        print("[*] Database already populated. Skipping seed.")
        return

    print("[*] Seeding AICTE Security Deposit & FDR Portal database...")

    # 1. Rules Configuration
    rules = [
        RulesConfig(
            key="TABLE_1_4_BASE_DEPOSIT",
            value={"amount": 3500000.0, "currency": "INR", "clause": "APH 2024-27 Table 1.4 Base"},
            version=1,
            valid_from="2026-04-01",
            approved_by="Executive Committee",
            is_active=True
        ),
        RulesConfig(
            key="CONCESSION_MULTIPLIER",
            value={"multiplier": 0.5, "eligible_categories": ["NE", "J&K", "Ladakh", "Aspirational", "Women", "PwD", "A&N", "Lakshadweep"]},
            version=1,
            valid_from="2026-04-01",
            approved_by="Executive Committee",
            is_active=True
        ),
        RulesConfig(
            key="LEASE_MULTIPLIER",
            value={"multiplier": 2.0, "tenure_type": "leased", "clause": "Clause 2.11 Land Tenure"},
            version=1,
            valid_from="2026-04-01",
            approved_by="Executive Committee",
            is_active=True
        ),
        RulesConfig(
            key="PENALTY_TIERS",
            value=[
                {"tier": 1, "deadline_month": 5, "deadline_day": 31, "penalty_pct": 10.0, "desc": "10% penalty up to 31 May"},
                {"tier": 2, "deadline_month": 7, "deadline_day": 31, "penalty_pct": 20.0, "desc": "20% penalty up to 31 July"},
                {"tier": 3, "deadline_month": 8, "deadline_day": 1, "penalty_pct": 20.0, "desc": "Eligible for withdrawal of approval"}
            ],
            version=1,
            valid_from="2026-04-01",
            approved_by="Executive Committee",
            is_active=True
        ),
        RulesConfig(
            key="REMINDER_SCHEDULE",
            value={"days": [90, 60, 30, 15, 7]},
            version=1,
            valid_from="2026-04-01",
            approved_by="Regulation Bureau",
            is_active=True
        )
    ]
    db.add_all(rules)
    db.flush()

    # 2. Institutions
    institutions = [
        Institution(
            id="INST-S01",
            name="Bengaluru Institute of Technology",
            region="South",
            state="Karnataka",
            tenure_type="owned",
            concession_category=None,
            punitive_flag=False,
            registered_email="director@bit-bangalore.edu.in",
            approval_period="2024-2027",
            status="Approved",
            intimation_date="2026-04-01",
            paid_date="2026-04-10"
        ),
        Institution(
            id="INST-S02",
            name="Coimbatore College of Engineering",
            region="South",
            state="Tamil Nadu",
            tenure_type="leased",
            concession_category=None,
            punitive_flag=True, # Punitive action applied!
            registered_email="principal@cce-kovai.edu.in",
            approval_period="2024-2027",
            status="Under Scrutiny",
            intimation_date="2026-04-01",
            paid_date="2026-05-15" # Late 10% penalty
        ),
        Institution(
            id="INST-NE01",
            name="Guwahati Academy of Technology",
            region="NE",
            state="Assam",
            tenure_type="owned",
            concession_category="North East Region Concession",
            punitive_flag=False,
            registered_email="office@gat-assam.edu.in",
            approval_period="2024-2027",
            status="Approved",
            intimation_date="2026-04-01",
            paid_date="2026-04-12"
        ),
        Institution(
            id="INST-N01",
            name="Delhi Technical Campus",
            region="North",
            state="Delhi",
            tenure_type="leased",
            concession_category=None,
            punitive_flag=False,
            registered_email="director@dtc-delhi.edu.in",
            approval_period="2024-2027",
            status="Approved",
            intimation_date="2026-04-01",
            paid_date="2026-08-10" # Late after 31 July -> eligible for withdrawal
        ),
        Institution(
            id="INST-W01",
            name="Pune Polytechnic for Women",
            region="West",
            state="Maharashtra",
            tenure_type="owned",
            concession_category="Women-only Institution Concession",
            punitive_flag=False,
            registered_email="trust@ppw-pune.edu.in",
            approval_period="2024-2027",
            status="Approved",
            intimation_date="2026-04-01",
            paid_date="2026-04-08"
        )
    ]
    db.add_all(institutions)
    db.flush()

    # 3. Users for each role
    password_hash = get_password_hash("admin123")
    users = [
        User(
            username="officer.head",
            full_name="Dr. R. K. Sharma (Bureau Head)",
            email="head.regulation@aicte-india.gov.in",
            role="head",
            region_scope=None, # All regions
            institution_id=None,
            hashed_password=password_hash
        ),
        User(
            username="officer.south",
            full_name="P. Venkatesh (Scrutiny Officer, South)",
            email="scrutiny.south@aicte-india.gov.in",
            role="scrutiny",
            region_scope="South",
            institution_id=None,
            hashed_password=password_hash
        ),
        User(
            username="officer.ne",
            full_name="M. Baruah (Scrutiny Officer, North East)",
            email="scrutiny.ne@aicte-india.gov.in",
            role="scrutiny",
            region_scope="NE",
            institution_id=None,
            hashed_password=password_hash
        ),
        User(
            username="finance.officer",
            full_name="S. Sundaram (Finance Officer)",
            email="finance@aicte-india.gov.in",
            role="finance",
            region_scope=None,
            institution_id=None,
            hashed_password=password_hash
        ),
        User(
            username="audit.officer",
            full_name="A. K. Mehta (Chief Vigilance Auditor)",
            email="audit@aicte-india.gov.in",
            role="auditor",
            region_scope=None,
            institution_id=None,
            hashed_password=password_hash
        ),
        User(
            username="committee.member",
            full_name="Prof. Sunita Deshmukh (Standing Hearing Committee)",
            email="shc.member@aicte-india.gov.in",
            role="committee",
            region_scope=None,
            institution_id=None,
            hashed_password=password_hash
        ),
        User(
            username="inst.s01",
            full_name="Registrar - Bengaluru Inst of Tech",
            email="director@bit-bangalore.edu.in",
            role="institution",
            region_scope="South",
            institution_id="INST-S01",
            hashed_password=password_hash
        ),
        User(
            username="inst.ne01",
            full_name="Director - Guwahati Academy of Tech",
            email="office@gat-assam.edu.in",
            role="institution",
            region_scope="NE",
            institution_id="INST-NE01",
            hashed_password=password_hash
        ),
        User(
            username="admin",
            full_name="AICTE System Administrator",
            email="portal.admin@aicte-india.gov.in",
            role="admin",
            region_scope=None,
            institution_id=None,
            hashed_password=password_hash
        )
    ]
    db.add_all(users)
    db.flush()

    # 4. Instruments (FDRs)
    instruments = [
        Instrument(
            id="INSTR-001",
            institution_id="INST-S01",
            type="FDR",
            reference="FDR-SBI-89211",
            bank="State Bank of India",
            amount=3500000.0,
            issue_date="2024-04-10",
            maturity_date="2027-04-10",
            status="active",
            remarks="Joint FDR in favor of Member Secretary AICTE and BIT"
        ),
        Instrument(
            id="INSTR-002",
            institution_id="INST-S02",
            type="FDR",
            reference="FDR-PNB-44120",
            bank="Punjab National Bank",
            amount=7000000.0, # Leased land double base
            issue_date="2021-05-15",
            maturity_date="2026-05-15", # Expiring within 30 days
            status="expiring",
            remarks="5-year deposit nearing maturity. Punitive hold in place."
        ),
        Instrument(
            id="INSTR-003",
            institution_id="INST-NE01",
            type="FDR",
            reference="FDR-CAN-10992",
            bank="Canara Bank",
            amount=1750000.0, # 50% NE concession
            issue_date="2021-04-12",
            maturity_date="2026-04-12", # Matured!
            status="matured",
            remarks="Matured FDR. Eligible for release upon submission of Affidavit 6."
        ),
        Instrument(
            id="INSTR-004",
            institution_id="INST-N01",
            type="FDR",
            reference="FDR-BOB-77189",
            bank="Bank of Baroda",
            amount=7000000.0,
            issue_date="2022-08-10",
            maturity_date="2027-08-10",
            status="active",
            remarks="Joint deposit under leased land norms."
        ),
        Instrument(
            id="INSTR-005",
            institution_id="INST-W01",
            type="FDR",
            reference="FDR-HDFC-33201",
            bank="HDFC Bank",
            amount=1750000.0,
            issue_date="2024-04-08",
            maturity_date="2027-04-08",
            status="active",
            remarks="Women-only concession category approved."
        )
    ]
    db.add_all(instruments)
    db.flush()

    # 5. Bank Statement Lines
    statement_lines = [
        StatementLine(
            source_file="sbi_nic_feed_april2026.csv",
            date="2026-04-10",
            utr="SBIN202604108871",
            amount=3500000.0,
            narration="RTGS CR-BENGALURU INST TECH-AICTE DEPOSIT",
            hash="stmt_hash_sbi_001"
        ),
        StatementLine(
            source_file="pnb_bank_statement_may2026.xlsx",
            date="2026-05-15",
            utr="PUNB202605151022",
            amount=6500000.0, # Difference with claim of 70,00,000 -> AMOUNT_MISMATCH
            narration="NEFT INW-COIMBATORE COLL ENGG-SEC DEP",
            hash="stmt_hash_pnb_002"
        ),
        StatementLine(
            source_file="canara_feed_april2026.csv",
            date="2026-04-12",
            utr="CNRB202604129983",
            amount=1750000.0,
            narration="RTGS AICTE SEC DEP GUWAHATI ACAD",
            hash="stmt_hash_canara_003"
        ),
        StatementLine(
            source_file="hdfc_feed_april2026.csv",
            date="2026-04-08",
            utr="HDFC202604084421",
            amount=1750000.0,
            narration="PUNE POLYTECHNIC WOMEN AICTE FDR",
            hash="stmt_hash_hdfc_004"
        ),
        StatementLine(
            source_file="sbi_nic_feed_april2026.csv",
            date="2026-04-14",
            utr="CANDIDATE99999",
            amount=3500000.0,
            narration="INTERBANK TRF AICTE DEPOSIT BENGALURU",
            hash="stmt_hash_sbi_candidate_005"
        )
    ]
    db.add_all(statement_lines)
    db.flush()

    # 6. Payment Claims
    claims = [
        # Exact match
        PaymentClaim(
            id="CLAIM-001",
            institution_id="INST-S01",
            utr="SBIN202604108871",
            amount=3500000.0,
            date="2026-04-10",
            provenance_tag="INSTITUTION_SUBMITTED",
            officer_decision="OFFICER_VERIFIED",
            decided_by="P. Venkatesh (scrutiny)",
            remarks="RTGS challan verified against SBI electronic feed.",
            created_at=datetime(2026, 4, 10, 10, 0, 0, tzinfo=timezone.utc)
        ),
        # Amount mismatch
        PaymentClaim(
            id="CLAIM-002",
            institution_id="INST-S02",
            utr="PUNB202605151022",
            amount=7000000.0,
            date="2026-05-15",
            provenance_tag="INSTITUTION_SUBMITTED",
            officer_decision="PENDING",
            remarks="Institution claims 70,00,000 but bank statement records credit of only 65,00,000.",
            created_at=datetime(2026, 4, 11, 10, 0, 0, tzinfo=timezone.utc)
        ),
        # Possible match
        PaymentClaim(
            id="CLAIM-003",
            institution_id="INST-NE01",
            utr="CNRB_NOT_FOUND_UTR",
            amount=3500000.0,
            date="2026-04-14",
            provenance_tag="INSTITUTION_SUBMITTED",
            officer_decision="PENDING",
            remarks="UTR differs from statement line; amount matches within date window.",
            created_at=datetime(2026, 4, 12, 10, 0, 0, tzinfo=timezone.utc)
        ),
        # Missing transaction
        PaymentClaim(
            id="CLAIM-004",
            institution_id="INST-N01",
            utr="MISSING_UTR_778899",
            amount=7000000.0,
            date="2026-08-10",
            provenance_tag="INSTITUTION_SUBMITTED",
            officer_decision="PENDING",
            remarks="Paid late and no statement line found for this UTR.",
            created_at=datetime(2026, 4, 13, 10, 0, 0, tzinfo=timezone.utc)
        ),
        # Duplicate claim (submitted later with same UTR as CLAIM-001)
        PaymentClaim(
            id="CLAIM-005",
            institution_id="INST-W01",
            utr="SBIN202604108871",
            amount=1750000.0,
            date="2026-04-10",
            provenance_tag="INSTITUTION_SUBMITTED",
            officer_decision="PENDING",
            remarks="Duplicate claim test: uses same UTR already submitted by INST-S01.",
            created_at=datetime(2026, 4, 14, 10, 0, 0, tzinfo=timezone.utc)
        )
    ]
    db.add_all(claims)
    db.flush()

    # Automatically verify all claims
    for c in claims:
        verify_payment_claim(db, c)

    # 7. Release Requests
    req1 = ReleaseRequest(
        id="REL-2026-001",
        institution_id="INST-NE01",
        instrument_id="INSTR-003",
        reason="FDR has matured after 5 academic years. Completed all AICTE regulatory requirements.",
        status="SUBMITTED",
        has_request_letter=True,
        has_affidavit_6=True,
        punitive_blocked=False
    )
    req2 = ReleaseRequest(
        id="REL-2026-002",
        institution_id="INST-S02",
        instrument_id="INSTR-002",
        reason="Closure of evening shift programs. Requesting return of security deposit.",
        status="SUBMITTED",
        has_request_letter=True,
        has_affidavit_6=False, # Missing affidavit 6!
        punitive_blocked=True  # Under punitive action!
    )
    db.add_all([req1, req2])
    db.flush()

    step1 = WorkflowStep(
        request_id=req1.id,
        step_name="SUBMISSION",
        actor_id="inst.ne01",
        actor_name="Director - Guwahati Academy of Tech",
        actor_role="institution",
        decision="SUBMITTED",
        notes="All documents attached as per Clause 6.46."
    )
    step2 = WorkflowStep(
        request_id=req2.id,
        step_name="SUBMISSION",
        actor_id="inst.s02",
        actor_name="Principal - Coimbatore College of Engg",
        actor_role="institution",
        decision="SUBMITTED",
        notes="Request letter submitted. Affidavit pending notary signature."
    )
    db.add_all([step1, step2])
    db.flush()

    # 8. Hash-Chained Audit Trail Genesis
    log_audit(
        db=db,
        actor_id="SYSTEM",
        actor_name="AICTE Regulation Bureau Portal System",
        actor_role="SYSTEM",
        action="Initialized AICTE Security Deposit / FDR Portal Database & Cryptographic Hash Chain Genesis",
        entity_type="System",
        entity_id="GENESIS",
        after_state={"status": "INITIALIZED", "version": "1.0.0"}
    )

    db.commit()
    print("[+] Database successfully seeded with AICTE reference data!")
