from datetime import datetime, timezone
import uuid
from sqlalchemy import (
    Column, String, Integer, Float, Boolean, DateTime, ForeignKey, Text, JSON, Index
)
from sqlalchemy.orm import relationship
from app.database import Base

# ── Gate state constants ───────────────────────────────────────────────────────
# Allowed gate states (server-enforced; never extend without updating all guards)
GATE_STATES = {
    "quarantined",       # file received, not yet screened
    "screening",         # safety screening in progress
    "cleared",           # passed screening + origin check; extraction allowed
    "held",              # origin check raised indicators; officer must decide
    "released_by_officer",  # officer manually cleared with reason; extraction allowed
    "rejected_resubmit", # officer rejected; institution must upload a new version
    "screening_failed",  # format/safety check failed; institution may re-upload
}

# Allowed origin-check result labels (never add "fake", "forged", "AI generated", etc.)
ORIGIN_CHECK_RESULTS = {
    "no_indicators_found",
    "inconclusive",
    "indicators_present",
    "check_failed",
}

CLEARED_GATE_STATES = {"cleared", "released_by_officer"}

def gen_uuid() -> str:
    return str(uuid.uuid4())

def utc_now() -> datetime:
    return datetime.now(timezone.utc)

class Institution(Base):
    __tablename__ = "institutions"

    id = Column(String(50), primary_key=True, index=True)
    name = Column(String(255), nullable=False, index=True)
    region = Column(String(50), nullable=False, index=True) # South, NE, North, West, East, Central
    state = Column(String(100), nullable=False)
    tenure_type = Column(String(50), default="owned")      # owned, leased
    concession_category = Column(String(100), nullable=True) # NE, J&K, Ladakh, Aspirational, Women, PwD
    punitive_flag = Column(Boolean, default=False)
    registered_email = Column(String(255), nullable=False)
    approval_period = Column(String(50), default="2024-2027")
    status = Column(String(50), default="Approved")
    intimation_date = Column(String(20), nullable=True)     # YYYY-MM-DD
    paid_date = Column(String(20), nullable=True)           # YYYY-MM-DD
    created_at = Column(DateTime, default=utc_now)

    instruments = relationship("Instrument", back_populates="institution", cascade="all, delete-orphan")
    claims = relationship("PaymentClaim", back_populates="institution", cascade="all, delete-orphan")
    documents = relationship("Document", back_populates="institution", cascade="all, delete-orphan")
    release_requests = relationship("ReleaseRequest", back_populates="institution", cascade="all, delete-orphan")


class User(Base):
    __tablename__ = "users"

    id = Column(String(50), primary_key=True, default=gen_uuid)
    username = Column(String(100), unique=True, index=True, nullable=False)
    full_name = Column(String(200), nullable=False)
    email = Column(String(255), unique=True, nullable=False)
    role = Column(String(50), nullable=False) # head, scrutiny, finance, committee, auditor, institution, admin
    region_scope = Column(String(50), nullable=True) # South, NE, etc., or None for all
    institution_id = Column(String(50), ForeignKey("institutions.id"), nullable=True)
    hashed_password = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=utc_now)


class Instrument(Base):
    __tablename__ = "instruments"

    id = Column(String(50), primary_key=True, default=gen_uuid)
    institution_id = Column(String(50), ForeignKey("institutions.id"), nullable=False, index=True)
    type = Column(String(50), default="FDR") # FDR, RTGS, other
    reference = Column(String(100), nullable=False, index=True)
    bank = Column(String(200), nullable=False)
    amount = Column(Float, nullable=False)
    issue_date = Column(String(20), nullable=False)    # YYYY-MM-DD
    maturity_date = Column(String(20), nullable=False)  # YYYY-MM-DD
    status = Column(String(50), default="active")       # active, expiring, matured, renewed, released
    replaces_id = Column(String(50), ForeignKey("instruments.id"), nullable=True) # Renewal / replacement linking
    remarks = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)

    institution = relationship("Institution", back_populates="instruments")
    documents = relationship("Document", back_populates="instrument")
    release_requests = relationship("ReleaseRequest", back_populates="instrument")
    deductions = relationship("Deduction", back_populates="instrument")


class StatementLine(Base):
    __tablename__ = "statement_lines"

    id = Column(String(50), primary_key=True, default=gen_uuid)
    source_file = Column(String(255), nullable=False)
    date = Column(String(20), nullable=False, index=True)
    utr = Column(String(100), nullable=False, index=True)
    amount = Column(Float, nullable=False)
    narration = Column(Text, nullable=False)
    hash = Column(String(64), unique=True, index=True, nullable=False) # sha256 deduplication
    created_at = Column(DateTime, default=utc_now)


class PaymentClaim(Base):
    __tablename__ = "payment_claims"

    id = Column(String(50), primary_key=True, default=gen_uuid)
    institution_id = Column(String(50), ForeignKey("institutions.id"), nullable=False, index=True)
    utr = Column(String(100), nullable=False, index=True)
    amount = Column(Float, nullable=False)
    date = Column(String(20), nullable=False)
    provenance_tag = Column(String(50), default="INSTITUTION_SUBMITTED")
    officer_decision = Column(String(50), default="PENDING") # PENDING, OFFICER_VERIFIED, CLARIFICATION_REQUESTED
    decided_by = Column(String(100), nullable=True)
    decided_at = Column(DateTime, nullable=True)
    remarks = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utc_now)

    institution = relationship("Institution", back_populates="claims")
    match_result = relationship("MatchResult", back_populates="claim", uselist=False, cascade="all, delete-orphan")


class MatchResult(Base):
    __tablename__ = "match_results"

    id = Column(String(50), primary_key=True, default=gen_uuid)
    claim_id = Column(String(50), ForeignKey("payment_claims.id"), unique=True, nullable=False)
    classification = Column(String(50), nullable=False) # EXACT_MATCH, POSSIBLE_MATCH, AMOUNT_MISMATCH, MISSING_TRANSACTION, DUPLICATE_CLAIM
    evidence_lines = Column(JSON, default=list)
    score = Column(Float, default=1.0)
    rule_ids = Column(JSON, default=list)
    suggested_action = Column(Text, nullable=False)
    created_at = Column(DateTime, default=utc_now)

    claim = relationship("PaymentClaim", back_populates="match_result")


class Document(Base):
    __tablename__ = "documents"

    id = Column(String(50), primary_key=True, default=gen_uuid)
    institution_id = Column(String(50), ForeignKey("institutions.id"), nullable=False, index=True)
    instrument_id = Column(String(50), ForeignKey("instruments.id"), nullable=True)
    file_name = Column(String(255), nullable=False)
    file_path = Column(String(500), nullable=False)
    file_key = Column(String(255), nullable=False)
    hash = Column(String(64), index=True, nullable=False)  # sha256
    file_size = Column(Integer, default=0)
    mime_type = Column(String(100), default="application/pdf")
    version = Column(Integer, default=1)
    virus_scan_status = Column(String(50), default="CLEAN")
    doc_type = Column(String(50), default="FDR_CERTIFICATE")  # FDR_CERTIFICATE, REQUEST_LETTER, AFFIDAVIT_6, STATEMENT
    uploaded_at = Column(DateTime, default=utc_now)

    # ── Gate fields (G1) ──────────────────────────────────────────────────────
    # Allowed states: quarantined | screening | cleared | held |
    #                 released_by_officer | rejected_resubmit | screening_failed
    gate_state = Column(String(50), default="quarantined", nullable=False)
    gate_reason = Column(Text, nullable=True)          # plain-language reason for current state
    file_format = Column(String(20), nullable=True)    # pdf | docx | xlsx | csv | jpg | png | webp
    quarantine_key = Column(String(255), nullable=True) # random filename under QUARANTINE_DIR
    screened_at = Column(DateTime, nullable=True)
    cleared_at = Column(DateTime, nullable=True)
    # screening_result stores raw ScreeningResult dict for officer view
    screening_result = Column(JSON, nullable=True)

    institution = relationship("Institution", back_populates="documents")
    instrument = relationship("Instrument", back_populates="documents")
    extraction = relationship("Extraction", back_populates="document", uselist=False, cascade="all, delete-orphan")
    flags = relationship("DiscrepancyFlag", back_populates="document", cascade="all, delete-orphan")
    gate_decisions = relationship("DocumentGateDecision", back_populates="document", cascade="all, delete-orphan")
    origin_checks = relationship("DocumentOriginCheck", back_populates="document", cascade="all, delete-orphan")


# Composite index for the officer hold queue
Document.__table_args__ = (
    Index("ix_doc_gate_inst_time", "gate_state", "institution_id", "uploaded_at"),
)


class DocumentGateDecision(Base):
    """Append-only log of every gate state transition."""
    __tablename__ = "document_gate_decisions"

    id = Column(String(50), primary_key=True, default=gen_uuid)
    document_id = Column(String(50), ForeignKey("documents.id"), nullable=False, index=True)
    version = Column(Integer, default=1)
    decided_by = Column(String(50), nullable=True)  # NULL = system decision
    decision = Column(String(50), nullable=False)   # cleared | held | released_by_officer | rejected_resubmit | screening_failed
    reason = Column(Text, nullable=True)
    policy_version = Column(String(20), nullable=True)
    created_at = Column(DateTime, default=utc_now)

    document = relationship("Document", back_populates="gate_decisions")


class DocumentOriginCheck(Base):
    """Stores the origin screening result signals for one document version."""
    __tablename__ = "document_origin_checks"

    id = Column(String(50), primary_key=True, default=gen_uuid)
    document_id = Column(String(50), ForeignKey("documents.id"), nullable=False, index=True)
    version = Column(Integer, default=1)
    # result label: no_indicators_found | inconclusive | indicators_present | check_failed
    result = Column(String(50), nullable=False)
    risk_level = Column(String(20), nullable=True)   # low | medium | high
    signals = Column(JSON, default=list)             # list of Signal dicts
    limitations = Column(Text, nullable=True)        # mandatory limitations note
    provider_versions = Column(JSON, default=dict)
    checked_at = Column(DateTime, default=utc_now)
    reviewed_by = Column(String(50), nullable=True)
    reviewed_note = Column(Text, nullable=True)

    document = relationship("Document", back_populates="origin_checks")


class ScreeningReport(Base):
    """Versioned, metadata-only report from the file safety screening stage."""
    __tablename__ = "screening_reports"

    id = Column(String(50), primary_key=True, default=gen_uuid)
    document_id = Column(String(50), ForeignKey("documents.id"), nullable=False, index=True)
    document_version = Column(Integer, default=1, nullable=False)
    checks = Column(JSON, default=list, nullable=False)
    origin_result = Column(String(50), nullable=True)
    risk_level = Column(String(20), nullable=True)
    policy_version = Column(String(20), nullable=True)
    started_at = Column(DateTime, nullable=False)
    finished_at = Column(DateTime, nullable=False)
    duration_ms = Column(Integer, default=0, nullable=False)
    worker_id = Column(String(100), nullable=False)
    created_at = Column(DateTime, default=utc_now)


class Extraction(Base):
    __tablename__ = "extractions"

    id = Column(String(50), primary_key=True, default=gen_uuid)
    document_id = Column(String(50), ForeignKey("documents.id"), unique=True, nullable=False)
    holder = Column(String(255), nullable=True)
    amount = Column(Float, nullable=True)
    issue_date = Column(String(20), nullable=True)
    maturity_date = Column(String(20), nullable=True)
    fdr_number = Column(String(100), nullable=True)
    bank = Column(String(200), nullable=True)
    raw_text = Column(Text, nullable=True)
    page_regions = Column(JSON, default=dict)
    created_at = Column(DateTime, default=utc_now)

    document = relationship("Document", back_populates="extraction")


class DiscrepancyFlag(Base):
    __tablename__ = "discrepancy_flags"

    id = Column(String(50), primary_key=True, default=gen_uuid)
    document_id = Column(String(50), ForeignKey("documents.id"), nullable=False, index=True)
    field_name = Column(String(100), nullable=False)
    extracted_value = Column(String(255), nullable=True)
    expected_value = Column(String(255), nullable=True)
    severity = Column(String(50), default="WARN") # WARN, FAIL, INFO
    rule_id = Column(String(50), nullable=False)
    discrepancy_note = Column(Text, nullable=False)
    created_at = Column(DateTime, default=utc_now)

    document = relationship("Document", back_populates="flags")


class ReleaseRequest(Base):
    __tablename__ = "release_requests"

    id = Column(String(50), primary_key=True, default=gen_uuid)
    institution_id = Column(String(50), ForeignKey("institutions.id"), nullable=False, index=True)
    instrument_id = Column(String(50), ForeignKey("instruments.id"), nullable=False, index=True)
    reason = Column(Text, nullable=False)
    status = Column(String(50), default="SUBMITTED") # SUBMITTED, IN_SCRUTINY, RECOMMENDED, AUTHORISED, REJECTED, CLOSED
    has_request_letter = Column(Boolean, default=False)
    has_affidavit_6 = Column(Boolean, default=False)
    punitive_blocked = Column(Boolean, default=False)
    speaking_order_ref = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)

    institution = relationship("Institution", back_populates="release_requests")
    instrument = relationship("Instrument", back_populates="release_requests")
    steps = relationship("WorkflowStep", back_populates="request", cascade="all, delete-orphan", order_by="WorkflowStep.created_at")


class WorkflowStep(Base):
    __tablename__ = "workflow_steps"

    id = Column(String(50), primary_key=True, default=gen_uuid)
    request_id = Column(String(50), ForeignKey("release_requests.id"), nullable=False, index=True)
    step_name = Column(String(100), nullable=False) # SUBMISSION, SCRUTINY, COMMITTEE_RECOMMENDATION, AUTHORISATION, APPEAL
    actor_id = Column(String(50), nullable=False)
    actor_name = Column(String(200), nullable=False)
    actor_role = Column(String(50), nullable=False)
    decision = Column(String(50), nullable=False) # SUBMITTED, RECOMMENDED, AUTHORISED, REJECTED
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utc_now)

    request = relationship("ReleaseRequest", back_populates="steps")


class Deduction(Base):
    __tablename__ = "deductions"

    id = Column(String(50), primary_key=True, default=gen_uuid)
    instrument_id = Column(String(50), ForeignKey("instruments.id"), nullable=False, index=True)
    release_request_id = Column(String(50), nullable=True)
    amount = Column(Float, nullable=False)
    reason = Column(Text, nullable=False)
    clause = Column(String(100), default="Clause 2.24 late penalty")
    balance_after = Column(Float, nullable=False)
    approved_by = Column(String(100), nullable=False)
    approved_at = Column(DateTime, default=utc_now)

    instrument = relationship("Instrument", back_populates="deductions")


class MailOutbox(Base):
    __tablename__ = "mail_outbox"

    id = Column(String(50), primary_key=True, default=gen_uuid)
    recipient = Column(String(255), nullable=False)
    recipient_role = Column(String(50), default="Institution")
    template = Column(String(100), nullable=False) # RELEASE_APPROVED, DEDUCTION_ORDER, APPROVAL_GRANTED, IMPORTANT_NOTICE
    subject = Column(String(255), nullable=False)
    body_rendered = Column(Text, nullable=False)
    status = Column(String(50), default="SENT") # QUEUED, SENT, FAILED
    sent_by = Column(String(100), nullable=False)
    provider_message_id = Column(String(100), default=gen_uuid)
    created_at = Column(DateTime, default=utc_now)


class Announcement(Base):
    __tablename__ = "announcements"

    id = Column(String(50), primary_key=True, default=gen_uuid)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=False)
    institution_id = Column(String(50), ForeignKey("institutions.id"), nullable=True, index=True)
    created_by = Column(String(50), ForeignKey("users.id"), nullable=False, index=True)
    attachments = Column(JSON, default=list, nullable=False)
    created_at = Column(DateTime, default=utc_now, index=True)


class RulesConfig(Base):
    __tablename__ = "rules_config"

    id = Column(String(50), primary_key=True, default=gen_uuid)
    key = Column(String(100), nullable=False, index=True)
    value = Column(JSON, nullable=False)
    version = Column(Integer, default=1)
    valid_from = Column(String(20), default="2026-04-01")
    approved_by = Column(String(100), default="Executive Committee")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=utc_now)


class AuditLog(Base):
    __tablename__ = "audit_log"

    seq = Column(Integer, primary_key=True, autoincrement=True)
    id = Column(String(50), default=gen_uuid, unique=True, index=True)
    timestamp = Column(DateTime, default=utc_now, index=True)
    timestamp_str = Column(String(50), nullable=True)
    actor_id = Column(String(50), nullable=False)
    actor_name = Column(String(200), nullable=False)
    actor_role = Column(String(50), nullable=False)
    action = Column(String(255), nullable=False)
    entity_type = Column(String(100), nullable=False)
    entity_id = Column(String(100), nullable=False)
    before_state = Column(JSON, nullable=True)
    after_state = Column(JSON, nullable=True)
    previous_hash = Column(String(64), nullable=False)
    hash = Column(String(64), nullable=False, index=True) # Append-only tamper-evident hash


class AssistantResult(Base):
    """Owner-scoped immutable snapshot used by the assistant and exports."""
    __tablename__ = "assistant_results"

    id = Column(String(50), primary_key=True, default=gen_uuid)
    owner_id = Column(String(50), nullable=False, index=True)
    question = Column(Text, nullable=False)
    scope_text = Column(String(255), nullable=False)
    mode = Column(String(20), nullable=False, default="basic")
    payload = Column(JSON, nullable=False)
    created_at = Column(DateTime, default=utc_now, index=True)
