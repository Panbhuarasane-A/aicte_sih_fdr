# AICTE Security Deposit / FDR Management Portal — Slide Facts

Evidence rule: this document reports repository evidence only. A path followed by
`::name` identifies the relevant function, component, constant, route, or section.
Status labels are used exactly as requested:

- **IMPLEMENTED** — the repository contains an end-to-end backend and frontend path.
- **FRONTEND-ONLY** — a UI exists, but its data or action is local/mock rather than a server workflow.
- **PARTIAL** — meaningful logic exists, but an important stage, integration, or surface is incomplete.
- **PLANNED** — mentioned as future work or a requirement, not implemented.
- **NOT FOUND** — no supporting implementation or statement was found.

## Part A — Project overview

### Identity and purpose

| Fact | Evidence |
|---|---|
| Project name in the repository | “AICTE FDR Portal”; the backend title is “AICTE Security Deposit / FDR Management Portal API”. `README.md` introduction; `backend/app/config.py::Settings.PROJECT_NAME` |
| Working name used in the request | “FDR Setu” is **NOT FOUND** in the repository. |
| One-line purpose | Manage AICTE security deposits/FDRs, institution submissions, bank-statement matching, document checks, release/refund workflow, assistant queries, reports, and audit records. `README.md` introduction; `backend/README.md` sections 1 and 5 |
| Problem addressed | Manual/local handling of FDR records, payment evidence, document review, maturity/release work, and officer scrutiny. The repository describes these workflows, but does not contain a measured problem baseline. `README.md`; `backend/README.md` |
| Maturity | **PARTIAL** — prototype-to-working demo. The README calls the frontend a “frontend prototype” and explicitly says it is not an AICTE service or production financial/identity system. The backend has real FastAPI/SQLAlchemy workflows and tests, but deployment and several integrations are stubs. `README.md`; `backend/README.md` |

### Top-two-level folder map

| Folder/file | Purpose |
|---|---|
| `src/` | React frontend pages, components, context, API client, local preview data, and CSS. |
| `src/pages/` | Login, registration, protected portal pages, officer/institution previews, assistant, documents, verification, maturity, release, audit, and notifications. `src/App.jsx` |
| `src/components/` | Layout, sidebar, command centres, notification UI, date picker, and shared UI. |
| `src/data/` | API-backed repository wrappers plus local preview seed/status definitions. |
| `src/lib/` | API client, formatting, and frontend helper logic. |
| `src/styles/` | CSS stylesheets; no Tailwind configuration was found. |
| `backend/app/` | FastAPI application, configuration, SQLAlchemy models, schemas, routers, services, screening, assistant semantic layer, and seed data. |
| `backend/app/routers/` | REST endpoints for auth, institutions, instruments, statements, claims, documents/gates, release, mail, assistant, dashboard, audit, and rules. |
| `backend/app/services/` | Matching, OCR/field extraction, document screening, gate orchestration, rules, notifications, reports, audit, and assistant logic. |
| `backend/aicte_portal.db` | Existing SQLite database file used by the local default configuration. `backend/app/config.py`; `backend/app/database.py` |
| `backend/uploads/` | Local uploaded/demo documents. |
| `backend/quarantine/` | Local quarantined document storage with random names. `backend/app/config.py`; `backend/app/routers/documents.py` |
| `backend/tests/` | Pytest service, endpoint, gate, foundation, assistant, and seed tests plus fixtures/evaluation tests. |
| `docs/` | Existing design, audit, assistant diagnosis documents; this file is the requested presentation fact sheet. |
| `public/` | Frontend banner/logo images. |

### Install and run

#### Frontend

```powershell
npm install
npm run dev
```

Default Vite port: `5173`. Production build: `npm run build`; local bundle preview:
`npm run preview`. `README.md`; `package.json`; `vite.config.js`.

#### Backend

```powershell
pip install -r backend/requirements.txt
$env:PYTHONPATH="backend;."
python backend/run.py
```

Default backend address: `http://127.0.0.1:8000`; docs at `/docs` and `/redoc`;
health at `/health`. `backend/README.md`; `backend/run.py`.

#### Docker option

`docker-compose.yml` defines PostgreSQL, API, frontend, and Mailpit services. It
requires environment variables named `POSTGRES_PASSWORD` and `SECRET_KEY`. The
repository does not establish that Docker is installed or that this compose stack
has been run. `docker-compose.yml`.

#### Environment variable names found

`DATABASE_URL`, `SECRET_KEY`, `IDENTIFIER_HASH_SALT`, `MAX_UPLOAD_MB`,
`PDF_MAX_PAGES`, `DOCX_MAX_ENTRIES`, `DOCX_MAX_UNCOMPRESSED_MB`, `DOCX_MAX_RATIO`,
`XLSX_MAX_ENTRIES`, `XLSX_MAX_UNCOMPRESSED_MB`, `XLSX_MAX_RATIO`, `CSV_MAX_ROWS`,
`CSV_MAX_COLS`, `IMG_MAX_PIXELS`, `IMG_MAX_DIM`, `GATE_AUTO_CLEAR_RESULTS`,
`GATE_NOT_ASSESSABLE_POLICY`, `GATE_HOLD_RESULTS`, `GATE_RETRY_ON_CHECK_FAILED`,
`GATE_POLICY_VERSION`, `USE_SYNTHETIC_ONLY`, `TEXT_DETECTOR`, `GEMINI_API_KEY`,
`POSTGRES_PASSWORD`. Names only; values are intentionally not reproduced.
`backend/app/config.py`; `backend/app/services/assistant_service.py`;
`.env.example`.

## Part B — Technology stack

| Area | Repository fact | Status |
|---|---|---|
| Frontend framework/language | React 18.3.1, JavaScript/JSX. No TypeScript files or TypeScript dependency were found. `package.json`; `src/` | USED |
| Frontend build/dev | Vite `^5.4.11`; `@vitejs/plugin-react` `^4.3.4`. `package.json`; `vite.config.js` | USED |
| Styling | Plain CSS files under `src/styles/`, including CSS custom properties. No Tailwind dependency/config found. `package.json`; `src/styles/` | USED |
| Router | `react-router-dom` `^7.18.4`; route definitions in `src/App.jsx`. | USED |
| Animation | GSAP `^3.15.0` used by `src/pages/Login.jsx`. | USED |
| Chart library | No frontend chart package. Assistant charts are CSS bars in `src/pages/Assistant.jsx`; XLSX export creates an OpenPyXL bar chart in `backend/app/routers/assistant.py::export_assistant_result`. | PARTIAL |
| Backend framework | FastAPI `>=0.110.0`, Uvicorn `>=0.28.0`. `backend/requirements.txt`; `backend/app/main.py` | USED |
| Backend language | Python; the backend source is `.py`. `backend/` | USED |
| Validation/schema | Pydantic `>=2.6.0`, `pydantic-settings >=2.2.0`. `backend/requirements.txt`; `backend/app/schemas/__init__.py` | USED |
| ORM/database | SQLAlchemy `>=2.0.28`; default local SQLite database; PostgreSQL URL supported by configuration and Docker compose. `backend/app/database.py`; `backend/app/config.py`; `docker-compose.yml` | USED / LISTED-BUT-UNVERIFIED for PostgreSQL runtime |
| Local file storage | Files are copied into `backend/quarantine` and/or `backend/uploads`; SHA-256 is recorded. `backend/app/routers/documents.py`; `backend/app/services/screening/common.py` | USED |
| Authentication | JSON login and OAuth2 password-form login issue JWT HS256 tokens; passwords are verified with bcrypt, with a plaintext equality compatibility path. `backend/app/routers/auth.py`; `backend/app/security.py` | USED |
| OCR/PDF | PyPDF2 `>=3.0.0` is used for PDF text extraction and statement PDF parsing. No OCR engine such as Tesseract was found. `backend/requirements.txt`; `backend/app/services/ocr_service.py`; `backend/app/routers/statements.py` | USED for PDF text extraction; NOT FOUND for OCR |
| Spreadsheet/document parsing | pandas, openpyxl, and Python zip/XML inspection. `backend/requirements.txt`; `backend/app/routers/statements.py`; `backend/app/services/screening/` | USED |
| Matching | RapidFuzz `>=3.6.0` for narration similarity. `backend/requirements.txt`; `backend/app/services/matching_engine.py` | USED |
| PDF/report generation | ReportLab is listed; report endpoints generate CSV in the visible router. `backend/requirements.txt`; `backend/app/routers/dashboard.py`; `backend/app/services/report_service.py` | LISTED-BUT-UNUSED in the reviewed path / report implementation needs confirmation |
| AI/LLM | Optional Google Gemini integration, model string `gemini-2.5-flash`, activated only when `GEMINI_API_KEY` exists. The Google package is imported dynamically and is not in `backend/requirements.txt`. `backend/app/services/assistant_service.py::_get_gemini_model` | PARTIAL |
| External APIs | No bank API, identity provider, storage API, SMS provider, or email SMTP client is configured. Mail is rendered into a database outbox with a generated provider-like ID. `README.md`; `backend/app/services/notification_service.py` | NOT FOUND for real external integration |
| Testing | pytest `>=8.0.0`, FastAPI TestClient/httpx, service tests and endpoint tests. `backend/requirements.txt`; `backend/tests/` | USED |

## Part C — Feature inventory

### 1. Transaction verification engine

**Status: IMPLEMENTED for the backend/API and API-backed officer page; frontend
preview transaction handling is a separate FRONTEND-ONLY path.**

| Item | Repository fact | Evidence |
|---|---|---|
| Inputs | Claim `institution_id`, `utr`, `amount`, `date`, optional remarks; statement lines contain source file, date, UTR, amount, narration, hash. `PaymentClaimCreate`; `StatementLine`; `backend/app/schemas/__init__.py`; `backend/app/models/__init__.py` |
| Matching fields | Exact UTR lookup; exact amount comparison; date-window/amount candidates; fuzzy narration versus institution name. Bank is present in institution/instrument records and can appear in evidence, but is not a primary database join key in the matching engine. `backend/app/services/matching_engine.py::verify_payment_claim` |
| Normalisation on statement import | Amount removes commas, `₹`, `Rs.`/`Rs`; rejects NaN, infinity, and non-positive values. Dates recognize common `YYYY-MM-DD`, `DD-MM-YYYY`, and `DD/MM/YYYY`-like strings, but `clean_date` can retain a raw first 10 characters. UTR is trimmed; if absent/short, narration is searched for a 10–24 character token, otherwise a synthetic `TXN-{date}-{amount}` value is generated. `backend/app/routers/statements.py::clean_amount`, `clean_date`, `parse_df_rows` |
| Matching window | Configurable setting `STATEMENT_MATCH_WINDOW_DAYS`, default 15 days. `backend/app/config.py`; `matching_engine.py` |
| Backend result categories | The engine emits exactly **5** classifications: `EXACT_MATCH`, `AMOUNT_MISMATCH`, `POSSIBLE_MATCH`, `DUPLICATE_CLAIM`, `MISSING_TRANSACTION`. `backend/app/services/matching_engine.py::verify_payment_claim` |
| Frontend status dictionary | The UI defines **9** labels: `EXACT_MATCH`, `POSSIBLE_MATCH`, `AMOUNT_MISMATCH`, `REFERENCE_MISMATCH`, `DATE_MISMATCH`, `DUPLICATE_CLAIM`, `MISSING_TRANSACTION`, `INSUFFICIENT_EVIDENCE`, `PENDING`. `src/data/statuses.js::MATCH_STATUSES` |
| Important count qualification | The UI has nine possible display statuses, but the reviewed backend engine does not generate `REFERENCE_MISMATCH`, `DATE_MISMATCH`, or `INSUFFICIENT_EVIDENCE` in its normal matching path. Do not claim nine backend result categories. |
| Explanation output | `MatchResult.evidence_lines`, numeric score, rule IDs, and suggested action are stored. Exact matches include UTR, amount, date, bank narration, source file, and optional required-deposit shortfall. Candidate matches include up to three candidate UTR/amount/date/narration rows. `matching_engine.py`; `MatchResult` model |
| Matched statement row | Yes, the evidence text includes the matched/candidate statement values and narration. It is returned as explanation data rather than a separate nested statement-row object. `matching_engine.py`; `src/pages/Verify.jsx` |
| Imports | CSV, XLS, XLSX, and PDF are parsed by `parse_statement_file`; PDF uses PyPDF2. `backend/app/routers/statements.py::parse_statement_file` |
| Duplicate detection | Statement lines use a SHA-256 hash of source file/date/UTR/amount/narration; import checks existing hashes and skips duplicates. Claims with an earlier identical UTR are classified `DUPLICATE_CLAIM`. `backend/app/routers/statements.py::compute_line_hash`; `matching_engine.py` |
| Frontend actions | List/filter/search claims, rerun matching, officer verify, request clarification, export a CSV. `src/pages/Verify.jsx`; `src/lib/api.js` |

### 2. AI document verification

**Status: PARTIAL.** The repository has real upload, quarantine, safety screening,
gate states, deterministic PDF/text extraction, comparisons, flags, and officer
views. It does not contain a complete AI authorship/forgery detector or OCR
pipeline.

| Item | Repository fact | Evidence |
|---|---|---|
| Accepted file types | `.pdf`, `.docx`, `.xlsx`, `.csv`, `.jpg`, `.jpeg`, `.png`, `.webp`; `.doc`, `.docm`, `.xls`, `.xlsm`, `.xlsb` and executable/script types are rejected. `backend/app/config.py`; `backend/app/services/screening/common.py`; `src/pages/Documents.jsx` |
| Size limit | Default `MAX_UPLOAD_MB=15`; frontend validates 15 MB. `backend/app/config.py`; `src/pages/Documents.jsx` |
| Quarantine | Uploads use random quarantine names outside the web root; screening is run and gate state is persisted. `backend/app/routers/documents.py`; `backend/app/config.py` |
| Safety screening | Extension/double-extension, size, MIME declaration, magic bytes, SHA-256, an antivirus hook, and format-specific checks. `backend/app/services/screening/__init__.py` |
| Format checks | PDF: page count, JavaScript, embedded files, launch actions, XFA, encryption, metadata, incremental updates/signature presence. DOCX/XLSX: ZIP limits, macro indicators, external links/relationships, metadata; XLSX hidden sheets. CSV: binary/encoding/row/column/formula-injection checks. Images: dimensions, pixel/decompression guard, animation, EXIF/software metadata. `backend/app/services/screening/pdf_screen.py`; `docx_screen.py`; `xlsx_screen.py`; `csv_screen.py`; `image_screen.py` |
| Origin/AI-generated/tampering check | A data model exists for `DocumentOriginCheck` and result labels `no_indicators_found`, `inconclusive`, `indicators_present`, `check_failed`, but the actual reviewed screening path maps a passed safety result to `no_indicators_found` and a failed one to `check_failed`. No external detector/provider is wired. `backend/app/models/__init__.py`; `backend/app/services/screening_service.py` |
| Text extraction order | Stage 1 screeners explicitly do **not** do text extraction/OCR/LLM calls. Extraction endpoints are gated by `require_gate_cleared`; this is implemented for the endpoint path. However, the upload code contains background processing/stub comments and the complete external origin stage is not implemented. `backend/app/services/screening/common.py`; `backend/app/routers/documents.py`; `backend/app/services/gate_guard.py` |
| Extraction method | PyPDF2 for PDF; direct UTF-8 text reads for `.txt` and `.csv`. There is no DOCX/XLSX/image OCR extractor in `extract_text_from_file`. `backend/app/services/ocr_service.py::extract_text_from_file` |
| Fields extracted | Holder, amount, issue date, maturity date, FDR number, bank, IFSC, AICTE institution ID, masked PAN/customer ID, UTR, account last four, amount in words, synthetic-demo marker; extraction model persists a subset plus raw text/page regions. `ocr_service.py::parse_extracted_fields`; `Extraction` model |
| Fallback/simulation | If extracted holder/amount/dates/FDR number are empty and linked institution/instrument exists, the service fills them from database records. This is a fallback/simulation, not OCR evidence. `ocr_service.py::process_document_verification` |
| Validation | Amount/date/FDR/instrument/institution comparisons and date logic create discrepancy flags. The foundation service also validates amount words/digits, date order, tenure, IFSC, and required fields. `ocr_service.py`; `backend/app/services/fdr_foundation.py::validate_fields`; `test_fdr_foundation.py` |
| Editable fields | **NOT FOUND** as a backend edit endpoint or frontend editable extraction form. Extraction is stored in the `extractions` table and displayed after gate clearance. |
| Saved per institution | Yes, `Document.institution_id` and related `Extraction`/`DiscrepancyFlag` records are persisted. `backend/app/models/__init__.py` |
| Officer visibility | Yes for authorized documents after gate clearance; non-cleared responses hide extraction/flags. `backend/app/routers/documents.py::_document_response`; frontend `Documents.jsx` |

### 3. AI assistant

**Status: PARTIAL.** Deterministic intent routing, allowlisted semantic metadata,
RBAC scoping, structured rows/charts/export, audit logging, and optional Gemini
synthesis exist. Gemini is not required for the deterministic answer path.

| Item | Repository fact | Evidence |
|---|---|---|
| Provider/model | Optional Google Gemini `gemini-2.5-flash`, initialized only when `GEMINI_API_KEY` is present; dynamically imported and absent from requirements. `backend/app/services/assistant_service.py::_get_gemini_model` |
| Query-to-answer path | `run_assistant_query` resolves fixed intents using Python/SQLAlchemy ORM queries; it does not execute raw SQL. The semantic layer defines allowlisted entities, fields, operators, groupings, sorting, limits, and chart hints. `assistant_service.py::_resolve_query_records`; `backend/app/assistant/semantic_layer.py` |
| Arithmetic | Deposit/penalty and mismatch calculations are performed by backend rule/matching code; Gemini receives retrieved rows for optional prose synthesis. `assistant_service.py`; `backend/app/services/rules_engine.py` |
| Supported intents/examples | Maturities, unmatched transactions, release requests with missing documents, mismatch cases, unpaid deposits, flagged/audit records, out-of-scope requests, and help guidance. UI examples include “Which FDRs are maturing in the next 30 days?”, “Which transactions have not been matched?”, “Show release requests with missing documents”, “Why was Coimbatore College of Engineering flagged?”, graph and Excel variants. `assistant_service.py`; `src/pages/Assistant.jsx`; `backend/tests/test_all_services.py` |
| Multilingual support | Query parser contains Tamil/Hindi chart/export keywords (`வரைபட`, `எக்செல்`, etc.), but no complete Tamil answer/content model or language guarantee was found. **PARTIAL**, not “English and Tamil assistant” as a full claim. `assistant_service.py::parse_presentation` |
| Chart output | Structured chart metadata is returned; the frontend renders CSS bar rows, not a chart library. `assistant_service.py::run_assistant_query`; `src/pages/Assistant.jsx::AssistantChart` |
| Table output | Structured table rows/columns are returned and rendered by the assistant page. `assistant_service.py`; `src/pages/Assistant.jsx` |
| Excel/CSV download | Implemented through `/api/assistant/results/{result_id}/export`; XLSX is built with openpyxl and includes Summary, Data, Query details, and Charts sheets. CSV is also supported. `backend/app/routers/assistant.py::export_assistant_result`; `src/lib/api.js` |
| Permission enforcement | Institutions are restricted to their institution; scrutiny officers to `region_scope`; broad roles can see all scoped records. Out-of-scope requests return `access_denied`. `assistant_service.py::_resolve_query_records`; `backend/app/security.py` |
| Prompt-injection handling | Gate tests include a fixture where document text says “ignore instructions”; the test verifies it does not change the result. Semantic schema uses extra-forbid and allowlists. This is a test control, not a formal security proof. `backend/tests/test_gate_g1.py`; `backend/app/assistant/semantic_layer.py` |

### 4. Lifecycle features

| Feature | Status | Evidence and limitation |
|---|---|---|
| FDR/instrument registry | IMPLEMENTED | `Instrument` model, list/create/update endpoints, frontend registry/calculator surfaces. `backend/app/routers/instruments.py`; `src/data/repositories.js` |
| Deposit calculator | IMPLEMENTED | Base amount, concession, lease multiplier, grace/penalty logic and deposit endpoint. `backend/app/services/rules_engine.py`; `backend/app/routers/institutions.py` |
| Maturity tracker | IMPLEMENTED | Backend returns `days_to_maturity`; frontend calendar/search/filter labels overdue/due in 30 days/upcoming/renewed/released. `backend/app/routers/instruments.py`; `src/pages/MaturityTracker.jsx` |
| Configurable maturity alert intervals | PARTIAL | Reminder schedule exists in seed/config (`[90,60,30,15,7]`) but no scheduler/notification job was found. `backend/app/config.py`; `backend/app/seed_data.py` |
| Renewal/replacement | PARTIAL | `replaces_id`, `renewed`, and `replaced` concepts exist; no dedicated renewal workflow endpoint was found. `Instrument` model; `backend/app/routers/instruments.py` |
| Release/refund requests | IMPLEMENTED | Submission, punitive block, request-letter/Affidavit 6 completeness check, committee recommendation, head authorization, rejection, deduction. `backend/app/routers/release.py` |
| Document checklist | IMPLEMENTED | Request Letter and Affidavit 6 are mandatory before committee recommendation. `release.py::committee_recommend_release` |
| Notifications | PARTIAL | Database outbox and rendered templates exist; real email/SMS delivery is not integrated. `notification_service.py`; `backend/app/routers/mail.py` |
| Audit log | IMPLEMENTED | Append-only SHA-256 hash chain, verification endpoint, and many workflow/query/export actions log entries. `backend/app/services/audit_service.py`; `backend/app/routers/audit.py` |
| Reports/exports | PARTIAL | CSV reports and assistant CSV/XLSX exports exist; report breadth and PDF generation are not demonstrated in the reviewed routes. `backend/app/routers/dashboard.py`; `backend/app/routers/assistant.py` |

### 5. Roles and security

| Control | Status | Evidence |
|---|---|---|
| Roles | IMPLEMENTED | `head`, `scrutiny`, `finance`, `committee`, `auditor`, `institution`, `admin`. `backend/app/seed_data.py`; `backend/app/security.py` |
| Region-scoped officers | IMPLEMENTED | Scrutiny users carry `region_scope`; institution/instrument/claim/document query paths filter region or institution. `security.py`; routers; `test_all_services.py::test_regional_isolation` |
| Institution isolation | IMPLEMENTED | Institution users are restricted to `institution_id`; helper raises 403 for other institutions. `security.py::enforce_institution_or_region_access`; document/release/assistant routes |
| Server-side permission checks | IMPLEMENTED | FastAPI dependencies `get_current_user`, `require_roles`, and row-level access helper. `security.py`; router dependencies |
| Password/session handling | PARTIAL | bcrypt/JWT login and client localStorage token restore exist; no MFA, approved identity provider, refresh/revocation, or server session store. `security.py`; `auth.py`; `PortalContext.jsx`; `README.md` limitations |
| Upload validation | PARTIAL | Extension, size, MIME, magic bytes, ZIP/image safety and formula injection checks; antivirus is an explicit always-clean stub. `screening/__init__.py`; `screening/common.py` |
| Encryption at rest | NOT FOUND | No file/database encryption implementation was found. |
| Input validation | PARTIAL | Pydantic models and allowlisted semantic query schema; some parsing helpers use permissive fallbacks. `backend/app/schemas/__init__.py`; `semantic_layer.py`; `statements.py` |
| Prompt-injection protection | PARTIAL | No raw document text is sent to screening/LLM; tests cover an injection fixture and assistant schema is allowlisted. No comprehensive prompt-injection policy or detector was found. `screening/common.py`; `test_gate_g1.py`; `semantic_layer.py` |

### 6. Trust status model

**Status: PARTIAL.** The frontend defines a five-item trust display list:
`Extracted` → `Matched to records` → `Independently confirmed` → `Officer reviewed`
→ `Competent Authority approved`. `src/data/statuses.js::TRUST_LEVELS`.

The backend does not use one unified five-level enum. Real backend status fields
include:

- Match classifications: `EXACT_MATCH`, `POSSIBLE_MATCH`, `AMOUNT_MISMATCH`,
  `DUPLICATE_CLAIM`, `MISSING_TRANSACTION`.
- Claim decisions: `PENDING`, `OFFICER_VERIFIED`, `CLARIFICATION_REQUESTED`.
- Gate states: `quarantined`, `screening`, `cleared`, `held`,
  `released_by_officer`, `rejected_resubmit`, `screening_failed`.
- Release states: `SUBMITTED`, `RECOMMENDED`, `AUTHORISED`, `REJECTED`, `CLOSED`
  (with other router/UI labels).
- Instrument statuses: active/expiring/matured/renewed/released and related UI labels.

Evidence: `backend/app/models/__init__.py`; `backend/app/services/matching_engine.py`;
`backend/app/routers/release.py`; `src/data/statuses.js`.

## Part D — Screens and user flows

### Routes

| Route | Purpose | Status |
|---|---|---|
| `/login` | Officer/institution login and demo account selection. | IMPLEMENTED with backend login; README still describes the older prototype limitation. |
| `/register` | Registration request form. | FRONTEND-ONLY; no backend registration endpoint. |
| `/officer-preview` | Local officer command-centre preview. | FRONTEND-ONLY. |
| `/institution-preview` | Local institution portal preview. | FRONTEND-ONLY. |
| `/dashboard` | Officer/institution dashboard summary. | IMPLEMENTED for API-backed dashboard; preview components are separate. |
| `/verify` | Claims, filters, evidence, rerun, officer decision, clarification, CSV export. | IMPLEMENTED. |
| `/documents` | Institution upload/status or officer document review. | PARTIAL: upload/gate/API paths exist; full AI origin/OCR editing is incomplete. |
| `/assistant` | Natural-language assistant, table/chart presentation, export. | PARTIAL. |
| `/calculator` | Deposit and penalty/FDR registry surface. | PARTIAL; backend calculation is implemented, while the combined registry/calculator presentation varies by role. |
| `/audit` | Audit list, reports, chain verification. | IMPLEMENTED. |
| `/maturities` | Maturity calendar and filters. | IMPLEMENTED. |
| `/release-requests` | Release/refund workflow. | PARTIAL; the workflow is implemented, but notification delivery is only a local outbox. |
| `/notifications` | Notification center assembled from API-backed data. | PARTIAL; no push/email delivery. |
| `/institution-announcements` | Institution announcements UI. | FRONTEND-ONLY unless backed by another loaded API path. |
| `/settings` | Institution settings/profile surface. | FRONTEND-ONLY; no corresponding general settings backend route found. |

### Real end-to-end flow available

1. Start backend and Vite frontend.
2. Log in with a seeded user; JWT is returned and stored in browser localStorage.
3. Dashboard loads institutions/instruments/claims/documents through `/api`.
4. An authorized officer imports a CSV/XLS/XLSX/PDF bank statement.
5. Institution or officer submits a claim; the backend runs matching against imported statement lines.
6. Officer opens `/verify`, reviews evidence, reruns matching if needed, verifies or requests clarification.
7. Authorized user uploads a document; it is quarantined and screened; extraction is available only after a cleared gate.
8. Institution submits a release request with required checklist fields; committee recommends; head authorizes or rejects.
9. Authorization updates the instrument and writes an outbox message plus audit records.
10. Officer can query the assistant, view structured rows/chart metadata, export CSV/XLSX, and verify the audit chain.

Evidence: `src/context/PortalContext.jsx`; `src/data/repositories.js`; backend routers/services listed above.

### Recommended screenshots and exact route steps

These are recommendations, not evidence that screenshots have been taken:

1. **Login** — open `/login`; select “AICTE Officer”; choose “Bureau Head”.
2. **Dashboard** — log in; open `/dashboard`.
3. **Transaction verification** — open `/verify`; select a claim; show evidence and status.
4. **Document gate/upload** — log in as `inst.s01`; open `/documents`; select type, linked FDR/claim, file, ownership confirmation; upload.
5. **Maturity tracker** — open `/maturities`; use calendar/filter.
6. **Release workflow** — open `/release-requests`; submit or review a request; show checklist/status.
7. **Assistant** — open `/assistant`; ask “Show the top mismatch cases as a graph and give me an Excel sheet.”
8. **Audit** — open `/audit`; show entries and chain verification.

## Part E — Data model

### Models/tables

The SQLAlchemy model file defines these entities:

`Institution`, `User`, `Instrument`, `StatementLine`, `PaymentClaim`,
`MatchResult`, `Document`, `DocumentGateDecision`, `DocumentOriginCheck`,
`ScreeningReport`, `Extraction`, `DiscrepancyFlag`, `ReleaseRequest`,
`WorkflowStep`, `Deduction`, `RulesConfig`, `AuditLog`, `MailOutbox`,
`AssistantResult`. `backend/app/models/__init__.py`.

### Key relationships

```text
Institution
 ├── User.institution_id
 ├── Instrument.institution_id
 │    ├── Document.instrument_id
 │    ├── ReleaseRequest.instrument_id
 │    └── Deduction.instrument_id
 ├── PaymentClaim.institution_id
 │    └── MatchResult.claim_id (one-to-one)
 ├── Document.institution_id
 │    ├── Extraction.document_id (one-to-one)
 │    ├── DiscrepancyFlag.document_id
 │    ├── DocumentGateDecision.document_id
 │    ├── DocumentOriginCheck.document_id
 │    └── ScreeningReport.document_id
 └── ReleaseRequest.institution_id
      └── WorkflowStep.request_id

AuditLog records actor/action/entity/before/after/hash-chain data.
RulesConfig stores versioned rule JSON.
MailOutbox stores rendered notification messages.
AssistantResult stores owner-scoped assistant result payloads.
```

### Seed and synthetic data

- `backend/app/seed_data.py` seeds users, institutions, instruments, statements,
  claims, rules, workflow records, and audit data when the database is empty.
- Demo users use the common seed password described in `backend/README.md`.
- Seed institutions include Bengaluru, Coimbatore, Guwahati, Delhi, and Pune
  examples with regions, dates, lease/concession/penalty conditions.
- Seed documents/files include FDR certificates and test certificates in
  `backend/uploads/` and quarantined sample files in `backend/quarantine/`.
- The OCR parser marks documents containing “SYNTHETIC DEMONSTRATION DOCUMENT”
  via `is_synthetic_demo`, but the visible UI does not consistently display that
  marker.
- Frontend preview data is explicitly empty in `src/data/seed.js` and the
  README says preview records are browser-local. The preview code can create
  local entries in localStorage. `README.md`; `src/data/seed.js`; preview pages.

## Part F — API surface

All paths below are under `/api` unless stated. “Auth” means a bearer JWT is
required. Exact role restrictions are summarized from router dependencies and
route checks.

| Method/path | Purpose | Auth/roles |
|---|---|---|
| POST `/auth/token` | OAuth2 password-form login | Public |
| POST `/auth/login` | JSON login | Public |
| GET `/me` | Current user | Auth |
| GET `/institutions` | List institutions | Auth; scoped by role |
| POST `/institutions` | Create institution | Router role check; admin/head in implementation |
| GET `/institutions/{id}` | Institution detail | Auth/scoped |
| GET `/institutions/{id}/deposit-calc` | Deposit/penalty calculation | Auth/scoped |
| GET `/instruments` | List FDR/instruments | Auth/scoped |
| POST `/instruments` | Create instrument | Auth/role checked |
| PATCH `/instruments/{id}` | Update instrument | Auth/role checked |
| POST `/statements/import` | Import CSV/XLS/XLSX/PDF statement | Auth; admin/head/finance/scrutiny |
| GET `/statements` | List statement lines | Auth |
| POST `/statements/re-verify` | Re-run claim matching | Auth/role checked |
| GET `/claims` | List claims | Auth/scoped |
| POST `/claims` | Submit claim and run matching | Auth/scoped |
| POST `/claims/{id}/verify` | Re-run matching | Auth/scoped |
| POST `/claims/{id}/officer-verify` | Officer decision | Auth/role checked |
| POST `/claims/{id}/clarify` | Clarification request | Auth/role checked |
| GET `/documents` | List documents | Auth/scoped |
| POST `/documents` | Upload/quarantine/screen document | Auth; institution/authorized roles |
| GET `/documents/{id}` | Document metadata | Auth/scoped |
| GET `/documents/{id}/status` | Plain-language gate status | Auth/scoped |
| GET `/documents/{id}/screening` | Screening report | Auth/scoped |
| POST `/documents/{id}/extract` | Run extraction after gate | Auth/scoped; gate-cleared |
| GET `/documents/{id}/extraction` | Get extraction/flags | Auth/scoped; gate-cleared |
| POST `/documents/{id}/note` | Add institution/officer note | Auth/scoped |
| GET `/documents/{id}/file` | Download binary | Auth/scoped |
| GET `/documents/gate/queue` | Officer gate queue | Auth/role checked |
| GET `/documents/{id}/gate` | Gate details | Auth/role checked |
| POST `/documents/{id}/gate/release` | Officer release | Auth/role checked |
| POST `/documents/{id}/gate/reject` | Reject/resubmit | Auth/role checked |
| POST `/documents/{id}/gate/request-clarification` | Gate clarification | Auth/role checked |
| GET `/settings/gate-policy` | Gate policy | Auth/role checked |
| GET `/release-requests` | List requests | Auth/scoped |
| POST `/release-requests` | Submit request | Auth/scoped |
| POST `/release-requests/{id}/recommend` | Committee recommendation | admin/head/committee/scrutiny |
| POST `/release-requests/{id}/authorise` | Competent-authority authorization | admin/head |
| POST `/release-requests/{id}/reject` | Reject request | Auth/role checked |
| POST `/deductions` | Record deduction | Auth/role checked |
| GET `/deductions` | List deductions | Auth/scoped |
| POST `/mail/send` | Render/queue notification | admin/head/scrutiny; decision templates head/admin |
| GET `/mail/outbox` | List outbox | admin/head/scrutiny/finance/auditor |
| POST `/assistant/query` | Scoped assistant query | Auth |
| GET `/assistant/results/{id}/export` | CSV/XLSX export | Auth; result owner |
| GET `/dashboard/summary` | Dashboard KPIs | Auth |
| GET `/reports/{report_type}` | Report download | Auth/role checked |
| GET `/audit` | Audit list | Auth/role checked |
| GET `/audit/verify` | Hash-chain verification | Auth/role checked |
| GET `/rules` | Active rules | Auth |
| GET `/rules/history` | Rule history | Auth |
| PUT `/rules` | Update policy rule | Admin path |

Evidence: route decorators in `backend/app/routers/*.py`; router inclusion in
`backend/app/main.py`; frontend API mapping in `src/lib/api.js`.

## Part G — Testing and evidence

### Existing tests

- `backend/tests/test_all_services.py`: health/root, auth roles, regional
  isolation, deposit/penalty calculations, transaction classifications, audit
  chain, assistant intents, and out-of-scope refusal.
- `backend/tests/test_workflows_and_endpoints.py`: endpoint workflow tests.
- `backend/tests/test_screening_service.py`: gate transitions, safe PDF
  screening/report persistence.
- `backend/tests/test_gate_g1.py`: extension spoofing, size, magic bytes, ZIP
  bombs, macros, formula injection, encrypted/unsafe PDF, gate guards,
  prompt-injection fixture, and institution document isolation.
- `backend/tests/test_fdr_foundation.py`: Indian amount words, normalization,
  provenance/schema, validation evidence, masking/hashing.
- `backend/tests/test_assistant_semantic_layer.py`: allowlisted entities/fields,
  grouping/sorting, and query limits.
- `backend/tests/test_assistant_semantic_layer.py` and
  `backend/tests/assistant_eval/test_assistant_intent_and_format.py`: assistant
  intent/output and scoping.
- `backend/tests/test_seed_lint.py`: seed-data checks.

### Test data/sample files

`backend/tests/fixtures/`, `backend/tests/assistant_eval/`, `backend/uploads/`,
and `backend/quarantine/` contain synthetic/demo certificates, PDFs, text files,
and generated security-screening fixtures. The test code explicitly generates
minimal PDFs, DOCX/XLSX ZIPs, PNGs, and prompt-injection text.

### Measured results

- The repository contains test assertions but no production accuracy benchmark,
  precision/recall, latency SLA, throughput, user-study result, or measured
  detection rate.
- Screening reports store `duration_ms`, but **NO MEASURED RESULTS FOUND** in
  the reviewed repository/reporting evidence.
- Do not put “accuracy”, “99%”, “seconds”, or similar metrics on slides.

### Suggested labelled test plan (do not present as completed)

1. **Matching correctness:** construct exact UTR/amount/date, amount mismatch,
   missing UTR, duplicate UTR, and same-amount date-window cases; measure
   classification precision/recall against a labelled fixture.
2. **Statement parsing:** test CSV/XLSX/PDF with Indian comma/rupee amounts,
   date formats, missing UTR, duplicate rows; measure parse success and
   duplicate rejection.
3. **Document gate safety:** test each accepted type plus spoofed extensions,
   macros, external links, encrypted PDFs, oversized files, image bombs, and
   CSV formulas; record pass/fail and false positives.
4. **Authorization:** test each role against own/other institution and region;
   record expected 200/403/409 outcomes.
5. **Assistant grounding:** compare structured results to database fixtures,
   including out-of-scope and prompt-injection inputs; measure unsupported-answer
   rate and scope leakage.
6. **Workflow integrity:** submit/recommend/authorize/reject release requests;
   verify instrument status, outbox records, and audit-chain validity.

## Part H — Gaps, risks, and limitations

### Simulated or not integrated

- README explicitly says this is not an official AICTE service and not connected
  to official identity, database, bank, notification, document-verification, or
  AI services. `README.md`.
- No real bank API or live reconciliation feed.
- No real SSO/identity provider, MFA, password recovery, refresh/revocation, or
  session store.
- No real email/SMS delivery; mail is a local outbox and the provider ID is
  generated in application code.
- Antivirus is `_antivirus_stub` and always returns clean.
- Origin/AI authorship detection provider is not wired; the current gate maps
  safety pass/fail to simple result labels.
- No OCR engine for scanned PDFs/images and no DOCX/XLSX/image text extraction.
- No editable extraction review endpoint/form.
- No scheduler for maturity reminders.
- No encryption-at-rest implementation found.
- Frontend previews use localStorage and manually selected labels; they are not
  shared or authoritative.
- Docker compose requires secrets and PostgreSQL but no evidence here proves a
  running compose deployment.

### Known implementation risks

| Risk | Mitigation already present | Evidence |
|---|---|---|
| File spoofing/malicious archives | Extension, MIME, magic bytes, ZIP limits, macro/external-link checks, image limits | `backend/app/services/screening/` |
| CSV formula injection | Detects formula prefixes; XLSX export prefixes dangerous cell values with apostrophe | `csv_screen.py`; `routers/assistant.py::safe_cell_value` |
| Prompt/document instruction injection | Screening does not send text to LLM; allowlisted assistant semantic schema; injection fixture | `screening/common.py`; `semantic_layer.py`; `test_gate_g1.py` |
| Cross-region/institution leakage | Server-side role and row-level filtering; tests | `security.py`; `test_all_services.py` |
| Audit tampering | SHA-256 previous-hash chain and verify endpoint | `audit_service.py` |
| Duplicate payment/document evidence | Statement-line hash, claim duplicate UTR, document SHA-256 | `statements.py`; `matching_engine.py`; `ocr_service.py` |
| Secrets/identity misuse | Config reads environment variable names and README warns against frontend secrets, but secret-manager integration is not present | `config.py`; `README.md` |

### TODO/FIXME evidence

No `TODO` or `FIXME` marker was found in the reviewed application source search.
The repository does contain explicit “stub”, “not configured”, “planned”, and
“not implemented” statements, especially for antivirus, origin verification,
production integrations, and the frontend prototype limitations.

## Part I — Claim check against current slides

| # | Claim | Verdict | Evidence / honest slide correction |
|---|---|---|---|
| 1 | Nine transaction result categories exist. | **PARTIAL** | Nine UI statuses exist in `src/data/statuses.js`, but the backend engine emits five categories. Say “nine UI status labels; five backend matching classifications” or list the five. |
| 2 | Frontend uses React + TypeScript + Tailwind. | **NOT FOUND** | React is verified; TypeScript and Tailwind are not. Change to “React + JavaScript/JSX + Vite + plain CSS”. |
| 3 | Backend uses FastAPI with PostgreSQL. | **PARTIAL** | FastAPI is used; PostgreSQL is supported in Docker/config, but default local runtime is SQLite and no live PostgreSQL result is evidenced. Say “FastAPI + SQLAlchemy; SQLite locally, PostgreSQL compose option”. |
| 4 | Gemini powers the AI assistant. | **PARTIAL** | Optional Gemini `gemini-2.5-flash` synthesis exists when `GEMINI_API_KEY` is set; deterministic ORM intent logic works without it. Say “rule/ORM assistant with optional Gemini synthesis”. |
| 5 | Assistant works in English and Tamil. | **PARTIAL** | Tamil keywords are recognized for chart/export parsing; complete Tamil conversational support is not found. Say “English UI/query examples with limited Tamil keyword handling”. |
| 6 | Assistant returns chart + table + Excel download. | **VERIFIED** | Structured table/chart metadata and XLSX export are implemented; frontend chart is CSS-rendered, not a chart library. |
| 7 | Officers are region-scoped; institutions see only their own records. | **VERIFIED** | Server-side filters/helpers and regional-isolation tests support this. `security.py`; routers; tests. |
| 8 | Origin check covers PDF, Word, Excel, CSV and image, and runs before text extraction. | **PARTIAL** | Safety screening covers PDF/DOCX/XLSX/CSV/images before gated extraction; a real origin/AI/tamper detector is not wired. Say “metadata/safety gate before extraction; origin detector not integrated”. |
| 9 | Extracted fields are editable, saved per institution, and visible to officer. | **PARTIAL** | Saved per institution and visible after clearance; editable field workflow is not found. Change to “stored and displayed after clearance; editing is not implemented”. |
| 10 | Statement-based matching with no fake bank API. | **VERIFIED** | Matching uses imported statement records; no bank API integration found. |
| 11 | Audit log records user actions. | **VERIFIED** | Audit calls cover workflow changes, assistant queries/exports, mail, and chain verification; not every frontend-only local action is server-audited. |
| 12 | Maturity alerts and release/refund checklist are configurable. | **PARTIAL** | Reminder intervals are configured in seed/settings but no scheduler was found; release checklist fields are implemented but not a general configurable checklist. Say “configurable reminder values, no scheduler; fixed Request Letter/Affidavit 6 gate”. |
| 13 | Five-level trust status ladder exists. | **PARTIAL** | Five labels exist in the frontend constant; backend uses multiple independent status fields rather than one enforced ladder. Say “five UI trust labels; backend status fields are separate”. |

## Part J — Slide-ready summary

### Slide 1 — Title

**AICTE Security Deposit / FDR Management Portal**

Evidence-backed one-line description: A React/FastAPI portal prototype for
institution submissions, imported-statement payment matching, document
screening/extraction, FDR maturity and release workflows, assistant queries,
reports, and tamper-evident audit records.

Do not call it an official AICTE production service.

### Slide 2 — Proposed solution

#### Five verified feature bullets

1. Import bank statements from CSV, XLS/XLSX, or PDF and match claims by UTR,
   amount, date window, and supporting narration.
2. Quarantine and screen uploaded PDF, DOCX, XLSX, CSV, and image files before
   gated extraction.
3. Maintain FDR/instrument records, deposit calculations, maturity views, and
   renewal/replacement fields.
4. Run release/refund requests through checklist, committee recommendation,
   competent-authority authorization, and audit logging.
5. Ask scoped record questions with structured table/chart metadata and CSV/XLSX
   export; optional Gemini prose synthesis is available when configured.

#### Innovation and uniqueness grounded in code

1. Statement evidence is separated from officer decisions: a match is not itself
   an approval.
2. Document gate states separate quarantine/screening/clearance from extraction.
3. Assistant query scope is injected from server-side role/region/institution
   permissions rather than trusting UI filters.
4. Audit records form a verifiable SHA-256 chain.
5. XLSX exports protect against spreadsheet formula injection and include data,
   query details, and optional chart sheets.

#### Demo story

Use the seeded Bureau Head or South officer account; inspect a claim in
`/verify`, show evidence and a manual decision, open `/assistant` for mismatch
cases with a graph/Excel request, then show `/audit/verify`. If demonstrating
documents, use a clearly labelled synthetic/test file and explain that origin
AI detection and OCR are incomplete.

### Slide 3 — Technical approach

#### Real layers

1. **Browser/UI:** React 18 JSX, React Router, Vite, plain CSS, localStorage
   only for preview paths.
2. **API:** FastAPI/Uvicorn, Pydantic request/response models, JWT bearer auth.
3. **Domain services:** SQLAlchemy ORM, matching engine, rules/penalty engine,
   document gate/screening, assistant intent layer, release workflow, audit.
4. **Persistence:** SQLite default local DB; PostgreSQL compose option; local
   uploads/quarantine.
5. **Optional intelligence:** RapidFuzz narration similarity; optional Gemini
   synthesis; PyPDF2 deterministic text extraction.

#### Six-step implementation process

1. Authenticate and derive role/region/institution scope.
2. Ingest and validate structured records or quarantine uploaded files.
3. Normalize statement/document inputs and compute hashes.
4. Run deterministic matching, rules, safety screening, and gated extraction.
5. Present evidence for officer/committee/authority action.
6. Persist workflow state, exports, notifications/outbox, and hash-chained
   audit entries.

### Slide 4 — Feasibility and viability

#### Feasibility

- Runs locally with Node/npm and Python dependencies.
- API docs are generated by FastAPI.
- SQLite makes the demo runnable without PostgreSQL; Docker compose defines a
  PostgreSQL option.
- Existing pytest coverage exercises workflows, security scope, screening, and
  assistant behavior.
- File limits, magic-byte checks, archive guards, and gate transitions are
  already represented in code/tests.

#### Viability

- Existing domain entities cover institutions, users, instruments, claims,
  statements, documents, release requests, deductions, rules, mail, assistant
  results, and audit logs.
- Server-side scoping supports regional officers and institution isolation.
- CSV/XLSX exports and audit verification support operational review.
- Configurable settings exist for policy, upload limits, statement window, and
  reminder values.
- Production viability still requires authorized identity, bank, storage,
  antivirus/origin provider, notification, encryption, operations, and policy
  ownership.

#### Challenge → mitigation pairs

1. **Duplicate or inconsistent payment evidence** → statement hashes, duplicate
   UTR classification, amount/date-window matching, evidence lines.
2. **Malicious/malformed uploads** → quarantine, extension/MIME/magic checks,
   ZIP/image limits, macro/external-link checks, gate transitions.
3. **Unauthorized regional access** → server-side RBAC and institution/region
   filters, plus tests.
4. **Audit alteration** → previous-hash SHA-256 chain and verification endpoint.
5. **Spreadsheet export injection** → dangerous cell prefixes are escaped in XLSX
   export; CSV screening flags formula prefixes.

### Slide 5 — Impact and benefits

Only claim qualitative benefits supported by the implemented workflows:

- Officers receive structured evidence and suggested review steps instead of
  only a binary match label.
- Institutions can see upload/gate status and submit release documentation.
- Regional officers are limited to authorized institutional scope.
- Maturity and release work are visible through shared workflow entities.
- Audit verification makes record-chain integrity checkable.
- Structured assistant results and exports can reduce manual lookup effort.

**No measured benefit numbers are present. Do not claim time saved, accuracy,
fraud reduction, adoption, or financial savings without a new study.**

### Slide 6 — Research and references

Repository-cited or directly used references:

- AICTE Approval Process Handbook 2024–27 and 2026–27 addendum/corrigendum,
  cited in `backend/README.md` and `backend/app/main.py`.
- DPDP Act 2023, cited in `backend/README.md` and frontend copy.
- FastAPI, Pydantic, SQLAlchemy, Uvicorn, React, Vite, React Router, GSAP,
  RapidFuzz, PyPDF2, pandas, openpyxl, ReportLab, pytest, bcrypt, and
  python-jose, as listed in `package.json`/`backend/requirements.txt`.
- OWASP CSV injection concept is named in `backend/app/services/screening/csv_screen.py`.
- The implementation uses SHA-256 hashing for files, identifiers, and audit
  chain blocks; the relevant code is in `ocr_service.py`, `fdr_foundation.py`,
  and `audit_service.py`.

No external research URLs, formal benchmark papers, or official API agreements
were found in the repository. Do not add citations that are not in the repo
without separately verifying them.

## Do NOT put on slides

- “Production-ready official AICTE service”.
- “FDR Setu” unless the project owners confirm it is the approved name; it is
  not found in the repository.
- Nine backend transaction categories; the engine currently emits five.
- TypeScript or Tailwind; the frontend is JavaScript/JSX and plain CSS.
- PostgreSQL as the only/current database; SQLite is the local default.
- Gemini as mandatory or as the source of all answers.
- Full English/Tamil conversational support.
- AI forgery/authorship detection, tamper verdicts, or guaranteed origin checks.
- OCR for scanned images/DOCX/XLSX; only limited PDF/text extraction is shown.
- Editable extracted fields.
- Real bank API reconciliation, real email/SMS delivery, real SSO/MFA, or
  encrypted-at-rest storage.
- Configurable scheduled maturity alerts.
- A fully enforced five-level backend trust ladder.
- Accuracy, latency, throughput, fraud reduction, user count, or financial
  savings numbers; **NO MEASURED RESULTS FOUND**.
