# AICTE FDR Portal

Frontend starter for an AICTE Fixed Deposit Receipt (FDR) and security-deposit portal. The application contains separate institution and officer UI previews, registration and sign-in screens, a protected portal shell, and layouts for deposit management, transaction verification, documents, assistant search, calculations, and audit views.

> **Important:** This repository is currently a frontend prototype. It is not an AICTE service, does not authenticate AICTE users, and is not connected to an official database, bank, notification service, or document-verification system. Do not enter real credentials, personal information, institutional records, or financial data.

## Run locally

Requirements: Node.js and npm versions supported by the installed Vite release.

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. Vite's development server is for local development and is not a production hosting service.

### Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite development server. |
| `npm run build` | Create the production frontend bundle in `dist/`. |
| `npm run preview` | Serve the production bundle locally for a preview. |

There is currently no configured automated test, lint, or type-check command in `package.json`.

## Current frontend

### Sign-in and registration screens

- The sign-in screen has separate institution and AICTE officer selections.
- Sign-in is deliberately disabled because no authorized identity provider or authentication API is configured.
- New institutions can view the registration-request form, but the form cannot submit a real request without a backend.
- **Already registered?** links to the institution frontend preview. The officer selection links to the officer command-centre preview.

### Institution portal preview

Open `/#/institution-preview` in the running application, or use **View institution portal** from the institution sign-in screen.

The preview includes these frontend sections:

- Dashboard summary and recent local transactions.
- Transaction entry and manually selected local status labels.
- FDR/deposit entry, amount summary, and maturity-date counts.
- Document file selection and a list of selected file names.
- Release/refund request drafts.
- Verification-status information.
- Basic text search over local entries; this is not an AI assistant.
- CSV report export and a local display-name setting.

Entries are stored in the current browser's `localStorage`. Selecting a document does not upload it; the preview stores only the selected file name in its list. Requests are drafts only. A “matched” label is a user-selected note, not bank reconciliation or official verification.

### Officer command-centre preview

Open `/#/officer-preview` in the running application, or use the link on the officer sign-in screen.

The preview allows users to add, edit, search, filter, export, and remove manually entered local records and update their local status labels. Summary cards are calculated from those entries. This is a local workspace and does not provide officer access, notifications, shared records, or official actions.

### Other portal routes

The protected portal shell includes dashboard, verification, documents, assistant, calculator, and audit pages. Access is guarded by a client-side session state. Since the current sign-in implementation does not establish a real session, these routes require an authorized authentication integration before they can be used as a real portal.

## What is not implemented

The frontend must not be treated as a production financial or identity system. The following are not connected:

- AICTE institution or officer identity verification, sign-in, password recovery, multi-factor authentication, or session management.
- Institution registration submission, officer notifications, or workflow approvals.
- A shared backend database, API, server-side authorization, or persistent audit log.
- Secure document upload, malware scanning, document storage, or official document review.
- Bank statement/FDR integrations, transaction matching, payment verification, or release processing.
- Authorized AI-backed natural-language search or an AI document-verification service.
- Official deposit/penalty rules, calculation approval, regional policy configuration, or scheduled reminders.
- Production monitoring, backups, incident response, retention controls, and operational support.

Local preview data is not a substitute for any of these services. The browser's local storage is not encrypted application storage, not shared with other users, and can be cleared or changed by the user.

## Work required for a full-fledged application

Complete the items below with the AICTE system owners, security team, and relevant banking and identity-service owners. Agree on requirements and obtain authorization before implementing production integrations.

### 1. Confirm scope, policy, and ownership

- Identify the institution and officer user journeys, allowed roles, regions, approval levels, and escalation paths.
- Obtain authoritative deposit, interest/penalty, grace-period, maturity, release, document, and verification rules, including effective dates and policy versioning.
- Define which records are authoritative, who may create or change them, and how records are reconciled with existing AICTE systems.
- Define data classification, privacy notices, purpose limitation, retention/deletion schedules, legal basis, and incident response ownership.
- Confirm accessibility, supported browsers/devices, expected scale, availability objectives, and disaster-recovery targets.

### 2. Build an authorized backend and API

- Select an AICTE-approved hosting environment, backend framework, database, object-storage service, and API contract.
- Design and document versioned APIs for authentication/session lifecycle, institution onboarding, users/roles, institutions, FDRs/deposits, transactions, documents, release/refund requests, notifications, search, calculations, and audit events.
- Validate every request on the server; use database constraints and transactions for financial/workflow state changes.
- Implement server-side role- and institution-scoped authorization. Do not rely on hidden UI elements or client-side route guards as access control.
- Use migrations, backups, restore testing, idempotency for retried financial/workflow requests, pagination, rate limits, and consistent error responses.
- Keep secrets and credentials in an approved secret manager. Never bundle backend secrets or privileged API keys into the Vite frontend.

### 3. Integrate real identity and access control

- Connect the approved AICTE identity provider/SSO, or another explicitly authorized identity service.
- Verify institution and officer identities and account status; implement secure password/MFA flows only if permitted by the identity owner.
- Enforce least privilege, role/region/institution scoping, session expiry, sign-out/revocation, and secure account recovery.
- Protect APIs and documents with server-side authorization on every request and record privileged actions in an immutable or tamper-evident audit service.
- Threat-model account takeover, privilege escalation, insecure direct object references, CSRF, XSS, replay, and session fixation.

### 4. Connect data, documents, and external services

- Replace preview `localStorage` reads/writes with authenticated API calls and real database persistence.
- Integrate approved bank/FDR data sources using documented agreements, authentication, reconciliation rules, and exception handling.
- Upload document contents to private, access-controlled storage using short-lived upload/download authorization; add file-size/type validation, malware scanning, encryption, retention, and deletion workflows.
- Build notification delivery and in-portal inbox state with retries, deduplication, delivery status, and authorized recipient rules.
- Configure any AI/search or document-analysis provider through an approved service boundary. Apply access filtering before retrieval, redact/minimize sensitive inputs, protect against prompt injection, log safely, and require human review for consequential decisions.
- Never let an AI system make or finalize financial, eligibility, or approval decisions without the policy owner’s explicit authorization and review process.

### 5. Implement workflow and financial correctness

- Translate only approved, versioned rules into server-side calculations and test them against policy-owner-approved examples and boundary cases.
- Define state machines and transition permissions for registration, transaction verification, document review, maturity, release/refund, and appeals/corrections.
- Support maker-checker or dual approval where required; prevent duplicate submissions and preserve prior values and decision reasons.
- Reconcile amounts and statuses with authoritative sources; provide clear exception, correction, reversal, and escalation workflows.
- Make every date/time, currency, rounding rule, policy version, and calculation explanation explicit and auditable.

### 6. Production hardening and launch

- Add automated unit, integration, API-contract, authorization, accessibility, and end-to-end tests, including negative permission tests and workflow boundary cases.
- Add linting, dependency/security scanning, secret scanning, build checks, and database migration checks to CI.
- Validate keyboard navigation, screen-reader labels, contrast, responsive layouts, localization, and error/loading/empty states.
- Configure HTTPS, secure headers, content security policy, CSRF protection where applicable, CORS allowlists, input/output encoding, rate limiting, and vulnerability management.
- Set up structured redacted logs, metrics, traces, alerting, uptime monitoring, audit review, backups, restore drills, disaster recovery, and incident runbooks.
- Complete privacy, security, legal, accessibility, and operational reviews; run a penetration test through the authorized process; obtain production go-live approval.
- Deploy to an AICTE-approved environment with separate development/staging/production configuration, controlled releases, rollback procedures, and support ownership.

## Suggested delivery order

1. Approve scope, data classification, policy rules, identity provider, and integration owners.
2. Write API contracts and threat model; agree on the database and document-storage architecture.
3. Implement backend authentication, server-side authorization, core data model, and audit foundations.
4. Replace preview-only state with API-backed institution and officer workflows.
5. Integrate document storage, notifications, bank/FDR services, and approved search/verification services.
6. Add automated verification, security/privacy/accessibility reviews, operational monitoring, and production deployment.

Do not use real institutional or financial data in the previews. Production use should begin only after the authorized services and controls above are implemented and approved.
