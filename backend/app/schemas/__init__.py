from typing import Optional, Any
from datetime import datetime
from pydantic import BaseModel, Field, EmailStr

# Auth Schemas
class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserOut"

class LoginRequest(BaseModel):
    username: str
    password: str

class UserOut(BaseModel):
    id: str
    username: str
    full_name: str
    email: str
    role: str
    region_scope: Optional[str] = None
    institution_id: Optional[str] = None
    is_active: bool

    model_config = {"from_attributes": True}

# Institution Schemas
class InstitutionCreate(BaseModel):
    id: str
    name: str
    region: str
    state: str
    tenure_type: str = "owned"
    concession_category: Optional[str] = None
    punitive_flag: bool = False
    registered_email: str
    approval_period: str = "2024-2027"
    status: str = "Approved"
    intimation_date: Optional[str] = None
    paid_date: Optional[str] = None

class InstitutionOut(InstitutionCreate):
    created_at: datetime

    model_config = {"from_attributes": True}

class DepositCalculationOut(BaseModel):
    institution_id: str
    institution_name: str
    base_amount: float
    concession_factor: float
    concession_category: Optional[str]
    lease_multiplier: float
    tenure_type: str
    required_deposit: float
    calculation_breakdown: str
    intimation_date: Optional[str]
    due_date: Optional[str]
    paid_date: Optional[str]
    penalty_pct: float
    penalty_amount: float
    payment_status_text: str
    eligible_for_withdrawal: bool

# Instrument Schemas
class InstrumentCreate(BaseModel):
    institution_id: str
    type: str = "FDR"
    reference: str
    bank: str
    amount: float
    issue_date: str
    maturity_date: str
    replaces_id: Optional[str] = None
    remarks: Optional[str] = None

class InstrumentUpdate(BaseModel):
    reference: Optional[str] = None
    bank: Optional[str] = None
    amount: Optional[float] = None
    issue_date: Optional[str] = None
    maturity_date: Optional[str] = None
    status: Optional[str] = None
    replaces_id: Optional[str] = None
    remarks: Optional[str] = None

class InstrumentOut(BaseModel):
    id: str
    institution_id: str
    institution_name: Optional[str] = None
    type: str
    reference: str
    bank: str
    amount: float
    issue_date: str
    maturity_date: str
    status: str
    replaces_id: Optional[str] = None
    remarks: Optional[str] = None
    days_to_maturity: Optional[int] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}

# Statement Line Schemas
class StatementLineOut(BaseModel):
    id: str
    source_file: str
    date: str
    utr: str
    amount: float
    narration: str
    hash: str
    created_at: datetime

    model_config = {"from_attributes": True}

# Claim Schemas
class PaymentClaimCreate(BaseModel):
    institution_id: str
    utr: str
    amount: float
    date: str
    remarks: Optional[str] = None

class MatchResultOut(BaseModel):
    classification: str
    evidence_lines: list[str]
    score: float
    rule_ids: list[str]
    suggested_action: str

    model_config = {"from_attributes": True}

class PaymentClaimOut(BaseModel):
    id: str
    institution_id: str
    institution_name: Optional[str] = None
    utr: str
    amount: float
    date: str
    provenance_tag: str
    officer_decision: str
    decided_by: Optional[str] = None
    decided_at: Optional[datetime] = None
    remarks: Optional[str] = None
    match_result: Optional[MatchResultOut] = None
    shortfall: Optional[float] = None
    required_deposit: Optional[float] = None
    created_at: datetime

    model_config = {"from_attributes": True}

class OfficerDecisionRequest(BaseModel):
    decision: str # OFFICER_VERIFIED or CLARIFICATION_REQUESTED
    notes: Optional[str] = None

# Document Schemas
class DiscrepancyFlagOut(BaseModel):
    field_name: str
    extracted_value: Optional[str] = None
    expected_value: Optional[str] = None
    severity: str
    rule_id: str
    discrepancy_note: str

    model_config = {"from_attributes": True}

class ExtractionOut(BaseModel):
    holder: Optional[str] = None
    amount: Optional[float] = None
    issue_date: Optional[str] = None
    maturity_date: Optional[str] = None
    fdr_number: Optional[str] = None
    bank: Optional[str] = None
    page_regions: Optional[dict] = None

    model_config = {"from_attributes": True}

class DocumentOut(BaseModel):
    id: str
    institution_id: str
    institution_name: Optional[str] = None
    instrument_id: Optional[str] = None
    file_name: str
    hash: str
    file_size: int
    mime_type: str
    version: int
    virus_scan_status: str
    doc_type: str
    uploaded_at: datetime
    extraction: Optional[ExtractionOut] = None
    flags: list[DiscrepancyFlagOut] = []

    model_config = {"from_attributes": True}

# Release Workflow Schemas
class ReleaseRequestCreate(BaseModel):
    institution_id: str
    instrument_id: str
    reason: str
    has_request_letter: bool = True
    has_affidavit_6: bool = True

class WorkflowStepOut(BaseModel):
    id: str
    step_name: str
    actor_id: str
    actor_name: str
    actor_role: str
    decision: str
    notes: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}

class ReleaseRequestOut(BaseModel):
    id: str
    institution_id: str
    institution_name: Optional[str] = None
    instrument_id: str
    instrument_ref: Optional[str] = None
    reason: str
    status: str
    has_request_letter: bool
    has_affidavit_6: bool
    punitive_blocked: bool
    speaking_order_ref: Optional[str] = None
    created_at: datetime
    steps: list[WorkflowStepOut] = []

    model_config = {"from_attributes": True}

class WorkflowActionRequest(BaseModel):
    notes: Optional[str] = None
    speaking_order_ref: Optional[str] = None

# Deduction Schemas
class DeductionCreate(BaseModel):
    instrument_id: str
    release_request_id: Optional[str] = None
    amount: float
    reason: str
    clause: str = "Clause 2.24 late penalty"

class DeductionOut(BaseModel):
    id: str
    instrument_id: str
    release_request_id: Optional[str] = None
    amount: float
    reason: str
    clause: str
    balance_after: float
    approved_by: str
    approved_at: datetime

    model_config = {"from_attributes": True}

# Notification Mail Schemas
class MailSendRequest(BaseModel):
    recipient: str
    recipient_role: str = "Institution"
    template: str
    case_id: Optional[str] = None
    custom_subject: Optional[str] = None
    custom_body: Optional[str] = None

class MailOutboxOut(BaseModel):
    id: str
    recipient: str
    recipient_role: str
    template: str
    subject: str
    body_rendered: str
    status: str
    sent_by: str
    provider_message_id: str
    created_at: datetime

    model_config = {"from_attributes": True}

# Assistant Schemas
class AssistantQueryRequest(BaseModel):
    query: str

class AssistantQueryResponse(BaseModel):
    title: str
    rows: list[str]
    evidence_route: Optional[str] = None
    access_denied: bool = False
    intent_matched: str
    suggested_questions: list[str] = []

# Dashboard & Report Schemas
class DashboardKPIs(BaseModel):
    active_fdrs: int
    expiring_soon_30_days: int
    matured_fdrs: int
    renewed_fdrs: int
    released_fdrs: int
    release_requests_pending: int
    flagged_claims: int
    penalty_cases: int
    total_deposit_value: float
    shortfall_total: float
    record_accuracy_pct: float

# Rules Config Schemas
class RuleConfigUpdate(BaseModel):
    key: str
    value: Any
    approved_by: str
    valid_from: Optional[str] = None

class RuleConfigOut(BaseModel):
    id: str
    key: str
    value: Any
    version: int
    valid_from: str
    approved_by: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}

# Audit Schemas
class AuditLogOut(BaseModel):
    id: str
    timestamp: datetime
    actor_id: str
    actor_name: str
    actor_role: str
    action: str
    entity_type: str
    entity_id: str
    before_state: Optional[Any] = None
    after_state: Optional[Any] = None
    previous_hash: str
    hash: str

    model_config = {"from_attributes": True}

class AuditVerificationResponse(BaseModel):
    total_records: int
    is_valid: bool
    tampered_index: Optional[int] = None
    message: str
