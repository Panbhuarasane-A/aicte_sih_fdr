# Repository Audit

## Current architecture

- **Frontend:** React 18 with JSX, Vite 5, and `react-router-dom` 7. There are no configured lint, type-check, or test scripts in `package.json`; `npm run build` is the available frontend validation command.
- **Routing:** `src/main.jsx` wraps the application in `HashRouter` and `PortalProvider`. `src/App.jsx` defines login, registration, officer/institution preview, and protected portal routes. Keep hash routing for local previews and existing links.
- **Authentication and state:** `PortalContext.jsx` restores the API session from local storage, exposes sign-in/sign-out and a client-side audit list, and provides the API client. It mixes server session state with ephemeral UI/workflow state (`audit`, `marks`, and registration requests).
- **API and persistence:** `src/lib/api.js` sends requests to the same-origin `/api` prefix and attaches the bearer token. The repository includes a FastAPI/SQLAlchemy backend under `backend/`; its default database is SQLite, with PostgreSQL configurable. The Vite server proxies `/api` to `127.0.0.1:8000`.
- **Data and rules:** `src/data/seed.js` currently exports empty institution, FDR, statement, claim, and document arrays, plus unset policy values. `src/lib/engine.js` contains deterministic matching, document comparison, and assistant-query logic coupled directly to those exports. It refuses some calculations when policy values are unset. Backend services and seeded database records are a separate data path.
- **Screens and components:** The UI is split across route pages and separate command-centre components. `Dashboard.jsx` renders `OfficerInbox` for officers and `InstitutionCommandCentre` for institutions; the standalone preview routes render `OfficerCommandCentre` and `InstitutionCommandCentre`. `PortalSidebar` is shared by several screens, while `Layout` provides a separate header/navigation shell for other protected routes. Pages make direct API calls independently.
- **Notifications:** The app has a notification route/page and a reusable header bell. Navigation and UI have recently been changed in the existing worktree; those edits are preserved.

## Findings relevant to the requested refactor

1. **There is no single source of truth.** Some UI reads backend API data, some prototype logic reads the empty frontend seed arrays, some previews hold browser-local data, and some summaries are fixed display values. These sources can disagree.
2. **Policy and synthetic-data guarantees are incomplete.** The frontend rule store is unset and the seed arrays are empty, while backend seed data and local database records exist. Policy provenance and synthetic-data labeling need to be explicit at the data boundary before showing derived financial outcomes.
3. **The shell is duplicated.** Protected `Layout`, officer/institution command centres, and standalone previews do not currently share one header/navigation implementation. Page-specific headers also repeat notification and profile controls.
4. **Similar workflows are separate surfaces.** The dashboard and officer preview use different officer components; transaction verification, officer verification, and document verification are separate routes/components. There is no case-detail route tying their evidence and history together.
5. **Status and display logic are page-local.** For example, transaction match labels/classes are defined inside `Verify.jsx`, and other pages maintain their own status strings. A shared status vocabulary and formatter would reduce inconsistent meanings.
6. **Authorization must remain server-enforced.** Client routes and `PortalContext` improve navigation but cannot enforce data access. The existing FastAPI authorization and institution/region scoping need to remain the authority and receive explicit cross-scope tests for new repository and assistant operations.
7. **Documentation does not match the current implementation.** The root README describes a disabled, frontend-only prototype, but the current application has API-backed login and a FastAPI backend. Documentation should be reconciled as implementation phases become verifiable.
8. **Worktree contains pre-existing edits.** There are uncommitted changes to `.vscode/tasks.json` and multiple frontend files, including notification-related files. They are outside this audit and must not be reverted or included in phase commits without explicit confirmation.

## Refactor constraints

- Preserve `HashRouter`, the existing Vite/API proxy, and working FastAPI integration unless a phase demonstrates a concrete need to change them.
- Establish one repository boundary that can use the existing API or synthetic demo data without having individual pages choose unrelated sources.
- Never present deterministic matching, extraction, or statement consistency as proof of authenticity, official verification, or approval.
- Mark synthetic and simulated data/workflows visibly, and keep unverified policy configuration distinct from confirmed policy.
- Validate each bounded phase with the available build command and focused tests; no lint command currently exists.
