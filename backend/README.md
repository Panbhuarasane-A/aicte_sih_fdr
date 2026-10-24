# AICTE Security Deposit / FDR Management Portal - Backend API

Production-ready backend implementation for the **All India Council for Technical Education (AICTE) - Regulation Bureau**, built strictly according to the **Approval Process Handbook (APH) 2024-27**, the **2026-27 Addendum/Corrigendum**, and the project architecture specification.

---

## 1. Key Design Principles & Compliance

1. **Submitted is not verified**: Every submission remains pending until verified by bank reconciliation and an authorised scrutiny officer.
2. **Statement match is evidence of consistency, not proof**: Matches show agreement with the bank statement line; only an authorised officer marks a claim verified.
3. **AI flags and routes; only an authorised officer decides**: AI document verification and discrepancy detection reports differences with source regions and rules; it never delivers a verdict on forgery.
4. **Append-Only Tamper-Evident Audit Trail**: Every state change, submission, AI extraction, and officer decision is logged into a SHA-256 cryptographic hash chain ($H_n = \text{SHA256}(H_{n-1} + \text{data})$). Any tampering is mathematically detectable.
5. **DPDP Act 2023 & Least Privilege RBAC**: Server-side row-level filtering by role and geographic region (South, North East, North, West, East, Central).

---

## 2. Technology Stack

| Layer | Component | Description & Rationale |
| :--- | :--- | :--- |
| **API Framework** | Python 3.10+ / FastAPI, Pydantic v2 | High-performance, typed asynchronous REST API with auto-generated OpenAPI / Swagger UI. |
| **Database & ORM** | PostgreSQL 16 / SQLite with SQLAlchemy 2.0 | ACID transactions, foreign key constraints, JSONB column support, audit logging. |
| **Security & Auth** | JWT (HS256) / bcrypt / Keycloak-compatible RBAC | Multi-role access control with region and institution scoping. |
| **Matching Engine** | RapidFuzz + SQL Queries | UTR matching, date window analysis (±15d), exact amount matching, and fuzzy narration scoring. |
| **Document Processing**| PyPDF2 / Regex Extractors / SHA-256 Hashing | Duplicate file fingerprinting, field extraction, date logic checks, discrepancy flagging. |
| **Reports** | Python CSV / PDF Generation | Dynamic exports for maturities, claims, penalties, and audit trails. |
| **Testing** | pytest, FastAPI TestClient | Comprehensive automated unit and integration tests (16/16 tests passing). |

---

## 3. Pre-Seeded Demo Credentials

All test accounts use the password: **`admin123`**

| Role | Username | Full Name | Scope |
| :--- | :--- | :--- | :--- |
| **Regulation Bureau Head** | `officer.head` | Dr. R. K. Sharma | All Regions (Competent Authority) |
| **Scrutiny Officer (South)**| `officer.south` | P. Venkatesh | South Region |
| **Scrutiny Officer (NE)** | `officer.ne` | M. Baruah | North East Region |
| **Finance Officer** | `finance.officer` | S. Sundaram | All Regions (Bank Statements & Reconciliation) |
| **Auditor** | `audit.officer` | A. K. Mehta | All Regions (Read-Only Audit & Hash Verification) |
| **Committee Member** | `committee.member`| Prof. Sunita Deshmukh| Standing Hearing Committee |
| **Institution User** | `inst.s01` | Registrar - BIT | Bengaluru Institute of Technology (South) |
| **Institution User** | `inst.ne01` | Director - GAT | Guwahati Academy of Technology (NE) |
| **System Administrator** | `admin` | Portal Administrator | Full Administration & Versioned Rules |

---

## 4. Quickstart Guide

### 1. Install Dependencies
```powershell
pip install -r backend/requirements.txt
```

### 2. Run the Backend API Server
```powershell
python backend/run.py
```
The server will start on **`http://127.0.0.1:8000`**.
- Interactive Swagger UI Docs: **`http://127.0.0.1:8000/docs`**
- Alternative ReDoc API Docs: **`http://127.0.0.1:8000/redoc`**
- Health Check: **`http://127.0.0.1:8000/health`**

### 3. Run Automated Tests
```powershell
$env:PYTHONPATH="backend;."
python -m pytest backend/tests -v
```

---

## 5. API Endpoints Overview

### Authentication & Identity
- `POST /api/auth/login`: Authenticate user and receive JWT access token.
- `POST /api/auth/token`: OAuth2 password flow endpoint.
- `GET /api/me`: Get current authenticated user, role, and assigned region/institution scope.

### Institutions & Deposit Calculator
- `GET /api/institutions`: List institution records (scoped by role/region).
- `POST /api/institutions`: Register a new institution (Admin / Bureau Head).
- `GET /api/institutions/{id}`: Detailed institution record.
- `GET /api/institutions/{id}/deposit-calc`: Live Table 1.4 deposit requirement and late-penalty position calculation.

### Instruments & FDRs
- `GET /api/instruments`: List active, expiring, matured, renewed, and released FDRs.
- `POST /api/instruments`: Register new FDR or RTGS instrument.
- `PATCH /api/instruments/{id}`: Update instrument or link replacement/renewal (`replaces_id`).

### Bank Statements & Reconciliation
- `POST /api/statements/import`: Upload and normalise CSV, Excel, or PDF statements; de-duplicates lines via SHA-256 hashes.
- `GET /api/statements`: List imported bank statement lines.

### Payment Claims & Transaction Verification
- `POST /api/claims`: Submit payment claim (UTR, amount, date). Automatically triggers the matching engine.
- `GET /api/claims`: View payment claims in scope.
- `POST /api/claims/{id}/verify`: Explicitly re-run matching engine against bank statements.
- `POST /api/claims/{id}/officer-verify`: Authorised scrutiny officer marks exact match as `OFFICER_VERIFIED`.
- `POST /api/claims/{id}/clarify`: Scrutiny officer issues clarification request to institution.

### Document Management & OCR
- `POST /api/documents`: Upload file (multipart); computes SHA-256 hash, runs virus check, OCR field extraction, date logic checks, and AI discrepancy detection.
- `GET /api/documents`: List uploaded documents in scope.
- `GET /api/documents/{id}/file`: Securely download uploaded file.
- `GET /api/documents/{id}/extraction`: View extracted OCR fields and discrepancy flags with mandatory legal disclaimer.

### Release & Refund Workflow
- `POST /api/release-requests`: Submit release request (verifies Request Letter & Affidavit 6; blocks if punitive action is active).
- `GET /api/release-requests`: List release requests in scope.
- `POST /api/release-requests/{id}/recommend`: Standing Hearing Committee records recommendation.
- `POST /api/release-requests/{id}/authorise`: Competent Authority (Bureau Head) issues speaking order and authorises release.
- `POST /api/release-requests/{id}/reject`: Reject release request with formal reason.
- `POST /api/deductions`: Bureau Head records penalty deduction under Clause 2.24 with balance calculation and appeal rights.
- `GET /api/deductions`: List applied deductions.

### Notifications & Mail Centre
- `POST /api/mail/send`: Render and dispatch templated notice/order (`RELEASE_APPROVED`, `DEDUCTION_ORDER`, `APPROVAL_GRANTED`, `IMPORTANT_NOTICE`).
- `GET /api/mail/outbox`: View notification delivery status and message IDs.

### Natural Language Records Assistant
- `POST /api/assistant/query`: Intent-routed, permission-scoped plain-language query answering (e.g., maturing FDRs, unmatched claims, missing affidavits, why an institution was flagged). Strictly enforces row-level permissions.

### Dashboard & Reports
- `GET /api/dashboard/summary`: High-level summary KPIs (active, expiring, matured, flagged, penalties, match accuracy %).
- `GET /api/reports/{report_type}`: Download CSV reports (`upcoming-maturities`, `pending-verifications`, `penalty-cases`, `audit-trail`).

### Tamper-Evident Audit Trail
- `GET /api/audit`: Search append-only audit trail.
- `GET /api/audit/verify`: Cryptographically traverse and verify SHA-256 block hash chains across the entire database.

### Policy Rules Engine
- `GET /api/rules`: Retrieve active Table 1.4 base amounts, concessions, lease multipliers, and penalty tiers.
- `GET /api/rules/history`: Full historical change log of policy rules.
- `PUT /api/rules`: Administrator updates policy rules with formal approval records.

---

## 6. Docker Compose Deployment

A sample `docker-compose.yml` is provided at project root to deploy the entire stack:
```bash
docker compose up -d --build
```
This deploys:
1. `api`: FastAPI Backend Service on port 8000
2. `frontend`: React 18 SPA on port 5173 (proxied via Nginx)
3. `postgres`: PostgreSQL 16 database with persistent storage
4. `mailpit`: Development SMTP testing server with web UI on port 8025
# Configuration

The API requires a `SECRET_KEY` environment variable for signing access tokens. Set a unique, randomly generated value for every deployment; do not commit it. For example, generate one with `python -c "import secrets; print(secrets.token_urlsafe(48))"` and export it before starting the API.

For Docker Compose, create a root `.env` file based on `.env.example` and replace both placeholder values before running `docker compose up`.
