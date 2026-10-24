from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.database import engine, Base, SessionLocal
from app.seed_data import seed_database
from app.routers import (
    auth, institutions, instruments, statements,
    claims, documents, release, mail, assistant,
    dashboard, audit, rules
)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Ensure tables exist & seed initial reference data
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seed_database(db)
    finally:
        db.close()
    yield
    # Shutdown logic if any

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="""
## AICTE Security Deposit / FDR Management Portal Backend API
All India Council for Technical Education · Regulation Bureau
Based on the Approval Process Handbook (APH) 2024-27 and 2026-27 Addendum.

### Key Capabilities:
- **Role-Based Access Control (RBAC)**: Regulation Bureau Head, Scrutiny Officers (Regional), Finance, Committee, Auditor, Institution Users, Admin.
- **Deposit & Penalty Engine**: Table 1.4 base amounts, 50% regional/special concessions, double for leased land, 15-day grace periods, 10%/20% penalty tiers.
- **Automated Transaction Reconciliation**: Exact, possible, amount mismatch, duplicate claim, and missing transaction classification.
- **Document Content Verification**: OCR field extraction, date logic verification, duplicate hash detection, AI discrepancy flagging.
- **Release & Deduction Workflows**: Multi-stage committee recommendation, competent authority authorization, speaking orders, Clause 2.24 deductions.
- **Tamper-Evident Audit Trail**: Append-only SHA-256 hash-chained block verification.
- **Natural Language Records Assistant**: Scoped parameterised queries with strict permission checking.
    """,
    lifespan=lifespan
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(auth.router, prefix=settings.API_V1_STR)
app.include_router(institutions.router, prefix=settings.API_V1_STR)
app.include_router(instruments.router, prefix=settings.API_V1_STR)
app.include_router(statements.router, prefix=settings.API_V1_STR)
app.include_router(claims.router, prefix=settings.API_V1_STR)
app.include_router(documents.router, prefix=settings.API_V1_STR)
app.include_router(release.router, prefix=settings.API_V1_STR)
app.include_router(mail.router, prefix=settings.API_V1_STR)
app.include_router(assistant.router, prefix=settings.API_V1_STR)
app.include_router(dashboard.router, prefix=settings.API_V1_STR)
app.include_router(audit.router, prefix=settings.API_V1_STR)
app.include_router(rules.router, prefix=settings.API_V1_STR)

@app.get("/")
def root():
    return {
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "status": "OPERATIONAL",
        "docs_url": "/docs",
        "redoc_url": "/redoc",
        "api_v1": settings.API_V1_STR
    }

@app.get("/health")
def health_check():
    return {
        "status": "HEALTHY",
        "database": "CONNECTED",
        "auth": "JWT_ENABLED",
        "version": settings.VERSION
    }
