import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.database import Base, engine, SessionLocal
from app.seed_data import seed_database
from app.models import AuditLog, Institution
from app.services.audit_service import verify_audit_chain, compute_block_hash
from app.services.rules_engine import calculate_deposit_requirement, calculate_payment_penalty
from app.services.matching_engine import verify_payment_claim

client = TestClient(app)

def get_auth_token(username="officer.head", password="admin123"):
    response = client.post("/api/auth/login", json={"username": username, "password": password})
    assert response.status_code == 200
    return response.json()["access_token"]

def test_health_and_root():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "HEALTHY"

def test_auth_roles():
    # Login as Head
    token_head = get_auth_token("officer.head")
    res_head = client.get("/api/me", headers={"Authorization": f"Bearer {token_head}"})
    assert res_head.status_code == 200
    assert res_head.json()["role"] == "head"

    # Login as Scrutiny South
    token_south = get_auth_token("officer.south")
    res_south = client.get("/api/me", headers={"Authorization": f"Bearer {token_south}"})
    assert res_south.status_code == 200
    assert res_south.json()["role"] == "scrutiny"
    assert res_south.json()["region_scope"] == "South"

    # Login as Institution S01
    token_inst = get_auth_token("inst.s01")
    res_inst = client.get("/api/me", headers={"Authorization": f"Bearer {token_inst}"})
    assert res_inst.status_code == 200
    assert res_inst.json()["role"] == "institution"
    assert res_inst.json()["institution_id"] == "INST-S01"

def test_regional_isolation():
    token_south = get_auth_token("officer.south")
    # South officer listing institutions should only see South institutions
    res = client.get("/api/institutions", headers={"Authorization": f"Bearer {token_south}"})
    assert res.status_code == 200
    data = res.json()
    assert all(item["region"] == "South" for item in data)
    assert any(item["id"] == "INST-S01" for item in data)
    assert not any(item["id"] == "INST-NE01" for item in data)

def test_rules_engine_deposit_calculation():
    db = SessionLocal()
    # 1. Standard owned institution (INST-S01) -> Base ₹35 Lakh
    inst_s01 = db.query(Institution).filter(Institution.id == "INST-S01").first()
    calc1 = calculate_deposit_requirement(inst_s01)
    assert calc1["required_deposit"] == 3500000.0

    # 2. Leased land institution (INST-S02) -> 2.0x = ₹70 Lakh
    inst_s02 = db.query(Institution).filter(Institution.id == "INST-S02").first()
    calc2 = calculate_deposit_requirement(inst_s02)
    assert calc2["required_deposit"] == 7000000.0

    # 3. North East concession institution (INST-NE01) -> 50% = ₹17.5 Lakh
    inst_ne01 = db.query(Institution).filter(Institution.id == "INST-NE01").first()
    calc3 = calculate_deposit_requirement(inst_ne01)
    assert calc3["required_deposit"] == 1750000.0
    db.close()

def test_penalty_engine():
    db = SessionLocal()
    inst = db.query(Institution).filter(Institution.id == "INST-S01").first()
    # Intimation: 2026-04-01, Due: 2026-04-16

    # Case 1: Paid on time (2026-04-10)
    pen1 = calculate_payment_penalty(inst, paid_date_override="2026-04-10")
    assert pen1["penalty_pct"] == 0.0
    assert pen1["penalty_amount"] == 0.0

    # Case 2: Paid in Tier 1 window up to 31 May (2026-05-15) -> 10% penalty
    pen2 = calculate_payment_penalty(inst, paid_date_override="2026-05-15")
    assert pen2["penalty_pct"] == 10.0
    assert pen2["penalty_amount"] == 350000.0

    # Case 3: Paid in Tier 2 window up to 31 July (2026-06-20) -> 20% penalty
    pen3 = calculate_payment_penalty(inst, paid_date_override="2026-06-20")
    assert pen3["penalty_pct"] == 20.0
    assert pen3["penalty_amount"] == 700000.0

    # Case 4: Paid after 31 July (2026-08-05) -> Eligible for withdrawal of approval
    pen4 = calculate_payment_penalty(inst, paid_date_override="2026-08-05")
    assert pen4["penalty_pct"] == 20.0
    assert pen4["eligible_for_withdrawal"] is True
    db.close()

def test_transaction_verification_classifications():
    token = get_auth_token("officer.head")
    res = client.get("/api/claims", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    claims = res.json()

    statuses = {c["match_result"]["classification"] for c in claims if c.get("match_result")}
    # Verifies that key matching engine classifications are populated
    assert "EXACT_MATCH" in statuses
    assert "AMOUNT_MISMATCH" in statuses
    assert "DUPLICATE_CLAIM" in statuses

def test_audit_log_hash_chain_integrity():
    token = get_auth_token("officer.head")
    res = client.get("/api/audit/verify", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    body = res.json()
    assert body["is_valid"] is True
    assert body["total_records"] >= 1
    assert body["tampered_index"] is None

def test_assistant_intent_router():
    token = get_auth_token("officer.head")

    # Maturing FDRs intent
    res1 = client.post("/api/assistant/query", json={"query": "FDRs maturing in the next 60 days"}, headers={"Authorization": f"Bearer {token}"})
    assert res1.status_code == 200
    assert res1.json()["intent_matched"] == "MATURITIES"

    # Unmatched claims intent
    res2 = client.post("/api/assistant/query", json={"query": "Which transactions have not been matched?"}, headers={"Authorization": f"Bearer {token}"})
    assert res2.status_code == 200
    assert res2.json()["intent_matched"] == "UNMATCHED_TRANSACTIONS"

    # Release requests intent
    res3 = client.post("/api/assistant/query", json={"query": "Show release requests with missing documents"}, headers={"Authorization": f"Bearer {token}"})
    assert res3.status_code == 200
    assert res3.json()["intent_matched"] == "RELEASE_REQUESTS"

def test_assistant_out_of_scope_refusal():
    # Scrutiny officer for South region asks about Guwahati (NE region)
    token_south = get_auth_token("officer.south")
    res = client.post("/api/assistant/query", json={"query": "Why was Guwahati Academy flagged?"}, headers={"Authorization": f"Bearer {token_south}"})
    assert res.status_code == 200
    body = res.json()
    assert body["access_denied"] is True
    assert "outside your authorized scope" in body["rows"][0]
