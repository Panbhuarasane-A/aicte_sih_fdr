import io
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.database import Base, engine, SessionLocal
from app.seed_data import seed_database

client = TestClient(app)

def get_auth_token(username="officer.head", password="admin123"):
    response = client.post("/api/auth/login", json={"username": username, "password": password})
    assert response.status_code == 200
    return response.json()["access_token"]

def test_release_workflow_complete_lifecycle():
    token_head = get_auth_token("officer.head")
    token_comm = get_auth_token("committee.member")

    # List release requests
    res = client.get("/api/release-requests", headers={"Authorization": f"Bearer {token_head}"})
    assert res.status_code == 200
    reqs = res.json()
    assert len(reqs) >= 2

    # Step 1: Recommend request REL-2026-001 (has both documents and not punitive blocked)
    res_rec = client.post(
        "/api/release-requests/REL-2026-001/recommend",
        json={"notes": "Scrutiny and physical documents verified. Recommended for release."},
        headers={"Authorization": f"Bearer {token_comm}"}
    )
    assert res_rec.status_code == 200
    assert res_rec.json()["status"] == "RECOMMENDED"

    # Step 2: Bureau Head Authorises with speaking order
    res_auth = client.post(
        "/api/release-requests/REL-2026-001/authorise",
        json={"speaking_order_ref": "AICTE/RB/SO/2026/089", "notes": "Approved pursuant to Clause 6.46."},
        headers={"Authorization": f"Bearer {token_head}"}
    )
    assert res_auth.status_code == 200
    assert res_auth.json()["status"] == "AUTHORISED"
    assert res_auth.json()["speaking_order_ref"] == "AICTE/RB/SO/2026/089"

    # Check instrument status changed to released
    res_instr = client.get("/api/instruments?institution_id=INST-NE01", headers={"Authorization": f"Bearer {token_head}"})
    assert res_instr.status_code == 200
    instruments = res_instr.json()
    fdr3 = next(i for i in instruments if i["id"] == "INSTR-003")
    assert fdr3["status"] == "released"

def test_punitive_block_on_release():
    token_comm = get_auth_token("committee.member")
    # REL-2026-002 is for INST-S02 (under punitive action!)
    res = client.post(
        "/api/release-requests/REL-2026-002/recommend",
        json={"notes": "Attempting recommendation"},
        headers={"Authorization": f"Bearer {token_comm}"}
    )
    assert res.status_code == 400
    assert "punitive action" in res.json()["detail"].lower()

def test_deduction_and_speaking_order():
    token_head = get_auth_token("officer.head")

    # Record deduction of ₹3,50,000 for late penalty on INSTR-001
    payload = {
        "instrument_id": "INSTR-001",
        "release_request_id": None,
        "amount": 350000.0,
        "reason": "Late compliance penalty under Table 1.4 Clause 2.24",
        "clause": "Clause 2.24 late penalty"
    }
    res = client.post("/api/deductions", json=payload, headers={"Authorization": f"Bearer {token_head}"})
    assert res.status_code == 201
    ded = res.json()
    assert ded["amount"] == 350000.0
    assert ded["balance_after"] == 3150000.0 # 35L - 3.5L

    # Verify outbox has deduction order email
    res_mail = client.get("/api/mail/outbox", headers={"Authorization": f"Bearer {token_head}"})
    assert res_mail.status_code == 200
    mails = res_mail.json()
    assert any("Deduction from Security Deposit" in m["subject"] for m in mails)

def test_statement_import_and_deduplication():
    token_fin = get_auth_token("finance.officer")

    csv_content = """Date,UTR,Amount,Narration
2026-05-20,TEST_UTR_UNIQUE_001,3500000.0,RTGS CR-NEW TEST-AICTE DEPOSIT
2026-05-21,TEST_UTR_UNIQUE_002,1750000.0,NEFT INW-NEW TEST-AICTE
"""
    files = {"file": ("test_statement.csv", io.BytesIO(csv_content.encode("utf-8")), "text/csv")}
    res = client.post("/api/statements/import", files=files, headers={"Authorization": f"Bearer {token_fin}"})
    assert res.status_code == 200
    assert res.json()["lines_imported"] == 2

    # Import exact same file again -> should deduplicate
    files_dup = {"file": ("test_statement.csv", io.BytesIO(csv_content.encode("utf-8")), "text/csv")}
    res_dup = client.post("/api/statements/import", files=files_dup, headers={"Authorization": f"Bearer {token_fin}"})
    assert res_dup.status_code == 200
    assert res_dup.json()["lines_imported"] == 0
    assert res_dup.json()["lines_skipped_as_duplicate"] == 2

def test_document_upload_and_extraction():
    token_inst = get_auth_token("inst.s01")

    doc_text = """Fixed Deposit Receipt
State Bank of India
Receipt No: FDR-SBI-TEST-998
Date of Issue: 2024-04-10
Date of Maturity: 2027-04-10
In favor of: Bengaluru Institute of Technology & Member Secretary AICTE
Amount: Rs. 35,00,000
Deposit under Chapter II Approval Process Handbook.
"""
    files = {"file": ("fdr_test_certificate.txt", io.BytesIO(doc_text.encode("utf-8")), "text/plain")}
    data = {
        "institution_id": "INST-S01",
        "instrument_id": "INSTR-001",
        "doc_type": "FDR_CERTIFICATE"
    }
    res = client.post("/api/documents", files=files, data=data, headers={"Authorization": f"Bearer {token_inst}"})
    assert res.status_code == 201
    doc = res.json()
    assert doc["hash"] is not None
    assert doc["virus_scan_status"] == "CLEAN"

    # View extraction & flags
    res_ext = client.get(f"/api/documents/{doc['id']}/extraction", headers={"Authorization": f"Bearer {token_inst}"})
    assert res_ext.status_code == 200
    ext_data = res_ext.json()
    assert ext_data["disclaimer"] == "AI-assisted discrepancy detection, not a determination of authenticity."

def test_dashboard_summary_and_reports():
    token_head = get_auth_token("officer.head")

    # Dashboard summary
    res = client.get("/api/dashboard/summary", headers={"Authorization": f"Bearer {token_head}"})
    assert res.status_code == 200
    kpis = res.json()
    assert kpis["active_fdrs"] >= 1
    assert kpis["total_deposit_value"] > 0

    # CSV report
    res_rep = client.get("/api/reports/pending-verifications", headers={"Authorization": f"Bearer {token_head}"})
    assert res_rep.status_code == 200
    assert "text/csv" in res_rep.headers["content-type"]
    assert "Institution ID,Institution Name" in res_rep.text

def test_rules_update_by_admin():
    token_admin = get_auth_token("admin")

    update_payload = {
        "key": "TABLE_1_4_BASE_DEPOSIT",
        "value": {"amount": 4000000.0, "currency": "INR", "clause": "Revised APH 2026-27 Base"},
        "approved_by": "Council Meeting 124"
    }
    res = client.put("/api/rules", json=update_payload, headers={"Authorization": f"Bearer {token_admin}"})
    assert res.status_code == 200
    rule = res.json()
    assert rule["version"] == 2
    assert rule["value"]["amount"] == 4000000.0

    # Non-admin cannot update rules
    token_south = get_auth_token("officer.south")
    res_denied = client.put("/api/rules", json=update_payload, headers={"Authorization": f"Bearer {token_south}"})
    assert res_denied.status_code == 403
