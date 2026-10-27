import hashlib
import io
import math
import re
import logging
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import StatementLine, PaymentClaim, User
from app.schemas import StatementLineOut
from app.security import get_current_user, require_roles
from app.services.audit_service import log_audit
from app.services.matching_engine import verify_payment_claim

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/statements", tags=["Bank Statements"])

def compute_line_hash(source_file: str, date_str: str, utr_str: str, amount_val: float, narr: str) -> str:
    content = f"{source_file}:{date_str}:{utr_str}:{amount_val:.2f}:{narr}"
    return hashlib.sha256(content.encode("utf-8")).hexdigest()

def clean_amount(val) -> Optional[float]:
    if val is None:
        return None
    try:
        if isinstance(val, (int, float)):
            f_val = float(val)
        else:
            s_val = str(val).replace(",", "").replace("₹", "").replace("Rs.", "").replace("Rs", "").strip()
            if s_val.startswith("(") and s_val.endswith(")"):
                s_val = f"-{s_val[1:-1]}"
            f_val = float(s_val)

        if math.isnan(f_val) or math.isinf(f_val) or f_val <= 0:
            return None
        return f_val
    except Exception:
        return None

def clean_date(val) -> Optional[str]:
    if val is None:
        return None
    try:
        import pandas as pd
        if isinstance(val, (pd.Timestamp, datetime)):
            return val.strftime("%Y-%m-%d")
        s = str(val).strip()
        if s.lower() in ["nan", "none", "nat", "total", "balance"] or len(s) < 6:
            return None
        # Match YYYY-MM-DD or DD-MM-YYYY or DD/MM/YYYY
        match = re.search(r'(\d{4}[-/]\d{1,2}[-/]\d{1,2})|(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})', s)
        if match:
            return match.group(0).replace("/", "-")
        return s[:10]
    except Exception:
        return None

def parse_df_rows(df) -> list[dict]:
    import pandas as pd
    # Locate table header row by scanning first 35 rows
    header_idx = -1
    for i in range(min(35, len(df))):
        row_vals = [str(x).lower().strip() for x in df.iloc[i].dropna()]
        has_date = any(any(k in v for k in ["txn date", "transaction date", "value date", "date", "dt"]) for v in row_vals)
        has_money = any(any(k in v for k in ["credit", "debit", "amount", "amt", "deposit", "balance"]) for v in row_vals)
        has_ref = any(any(k in v for k in ["utr", "transaction id", "ref", "chq", "instrument", "particular", "desc", "narr"]) for v in row_vals)
        if (has_date and has_money) or (has_date and has_ref):
            header_idx = i
            break

    if header_idx != -1:
        cols_raw = [str(c).lower().strip() for c in df.iloc[header_idx]]
        work_df = df.iloc[header_idx + 1:].copy()
        work_df.columns = cols_raw
    else:
        work_df = df.copy()
        work_df.columns = [str(c).lower().strip() for c in work_df.columns]

    cols = list(work_df.columns)

    # 1. Date column
    date_col = next((c for c in cols if any(k in c for k in ["txn date", "transaction date", "value date", "trans date", "date", "dt"])), cols[0])

    # 2. UTR column
    utr_col = next((c for c in cols if any(k in c for k in ["utr", "transaction id", "txn id", "reference", "ref", "chq", "cheque", "instrument"])), None)

    # 3. Credit / Inflow Amount column
    amt_col = None
    for c in cols:
        if any(k in c for k in ["credit", "cr_amt", "cr amt", "deposit", "inflow", "received"]) and not any(k in c for k in ["desc", "narr", "id", "ref"]):
            amt_col = c
            break
    if not amt_col:
        for c in cols:
            if any(k in c for k in ["amount", "amt"]) and not any(k in c for k in ["desc", "narr", "bal", "debit"]):
                amt_col = c
                break
    if not amt_col:
        for c in cols:
            if re.search(r'\bcr\b', c) and not any(k in c for k in ["desc", "narr", "bal"]):
                amt_col = c
                break

    # 4. Narration / Party columns (combines description and remitter/beneficiary if present)
    desc_col = next((c for c in cols if any(k in c for k in ["desc", "particular", "narr", "detail", "remark"])), None)
    remitter_col = next((c for c in cols if any(k in c for k in ["remitter", "beneficiary", "payer", "party", "institution"])), None)

    parsed_lines = []
    for _, r in work_df.iterrows():
        # Validate amount
        raw_amt = r.get(amt_col) if amt_col else None
        amt_val = clean_amount(raw_amt)
        if amt_val is None:
            continue

        # Validate date
        raw_date = r.get(date_col) if date_col else None
        date_str = clean_date(raw_date)
        if not date_str:
            continue

        # Clean narration
        parts = []
        if desc_col:
            d_val = str(r.get(desc_col, "")).strip()
            if d_val and d_val.lower() not in ["nan", "none"]:
                parts.append(d_val)
        if remitter_col:
            rem_val = str(r.get(remitter_col, "")).strip()
            if rem_val and rem_val.lower() not in ["nan", "none"]:
                parts.append(rem_val)
        narration = " - ".join(parts) if parts else "Bank Transfer Feed"

        # Clean UTR
        utr_val = str(r.get(utr_col, "")).strip() if utr_col else ""
        if utr_val.lower() in ["nan", "none"] or len(utr_val) < 3:
            utr_match = re.search(r'\b[A-Za-z0-9]{10,24}\b', narration)
            utr_val = utr_match.group(0) if utr_match else f"TXN-{date_str}-{int(amt_val)}"

        parsed_lines.append({
            "date": date_str,
            "utr": utr_val,
            "amount": amt_val,
            "narration": narration
        })

    return parsed_lines

def parse_statement_file(contents: bytes, filename: str) -> list[dict]:
    ext = filename.split(".")[-1].lower()
    import pandas as pd

    # Try loading as DataFrame via Excel or CSV with automatic fallbacks
    df = None
    if ext in ["xlsx", "xls"]:
        try:
            df = pd.read_excel(io.BytesIO(contents), header=None)
        except Exception:
            pass

    if df is None and ext != "pdf":
        for enc in ["utf-8-sig", "utf-8", "latin1", "cp1252"]:
            try:
                df = pd.read_csv(io.BytesIO(contents), header=None, encoding=enc)
                break
            except Exception:
                pass

    if df is not None:
        return parse_df_rows(df)

    # PDF fallback
    if ext == "pdf":
        import PyPDF2
        parsed_lines = []
        try:
            reader = PyPDF2.PdfReader(io.BytesIO(contents))
            pdf_text = "\n".join(page.extract_text() or "" for page in reader.pages)
            for line in pdf_text.splitlines():
                d_match = re.search(r'\b(\d{4}[-/]\d{2}[-/]\d{2}|\d{2}[-/]\d{2}[-/]\d{4})\b', line)
                amt_match = re.search(r'\b([0-9]{1,3}(?:,[0-9]{2,3})*(?:\.[0-9]{2})?)\b', line)
                if d_match and amt_match:
                    amt_val = clean_amount(amt_match.group(1))
                    if amt_val and amt_val > 100:
                        date_str = clean_date(d_match.group(1))
                        utr_match = re.search(r'\b[A-Za-z0-9]{10,24}\b', line)
                        utr_val = utr_match.group(0) if utr_match else f"TXN-{date_str}-{int(amt_val)}"
                        parsed_lines.append({
                            "date": date_str,
                            "utr": utr_val,
                            "amount": amt_val,
                            "narration": line[:150].strip()
                        })
        except Exception as e:
            logger.warning(f"PDF extraction error: {e}")
        return parsed_lines

    return []

@router.post("/import", response_model=dict)
async def import_bank_statement(
    file: UploadFile = File(...),
    current_user: User = Depends(require_roles("admin", "head", "finance", "scrutiny")),
    db: Session = Depends(get_db)
):
    """
    Implements Feature 6: Bank statement import
    Uploads CSV, XLSX or PDF statements; robustly parses header/transaction rows,
    de-duplicates lines, saves source file and hash, and re-runs claim reconciliation.
    """
    contents = await file.read()
    filename = file.filename or "statement_import.csv"

    try:
        parsed_rows = parse_statement_file(contents, filename)
    except Exception as parse_err:
        raise HTTPException(
            status_code=400,
            detail=f"Could not parse bank statement: {str(parse_err)}"
        )

    if not parsed_rows:
        raise HTTPException(
            status_code=400,
            detail=f"No valid transaction rows found in '{filename}'. Please verify that the sheet contains Date, UTR / Reference, and Credit/Amount columns."
        )

    lines_imported = 0
    lines_skipped = 0

    try:
        for r in parsed_rows:
            date_str = str(r["date"]).strip()
            utr_str = str(r["utr"]).strip()
            amount_val = float(r["amount"])
            narration = str(r.get("narration", "")).strip() or "Bank Statement Feed"

            line_hash = compute_line_hash(filename, date_str, utr_str, amount_val, narration)
            existing = db.query(StatementLine).filter(
                (StatementLine.hash == line_hash) |
                ((StatementLine.utr == utr_str) & (StatementLine.amount == amount_val))
            ).first()

            if existing:
                lines_skipped += 1
                continue

            stmt_line = StatementLine(
                source_file=filename,
                date=date_str,
                utr=utr_str,
                amount=amount_val,
                narration=narration,
                hash=line_hash
            )
            db.add(stmt_line)
            lines_imported += 1

        db.flush()

        # Automatically re-run verification engine for all payment claims against new statement lines
        all_claims = db.query(PaymentClaim).all()
        for claim in all_claims:
            verify_payment_claim(db, claim)

        db.commit()

        log_audit(
            db=db,
            actor_id=current_user.id,
            actor_name=current_user.full_name,
            actor_role=current_user.role,
            action=f"Imported bank statement feed: '{filename}' ({lines_imported} added, {lines_skipped} duplicate lines skipped)",
            entity_type="StatementLine",
            entity_id=filename,
            after_state={"imported_lines": lines_imported, "skipped_lines": lines_skipped}
        )
        db.commit()

        return {
            "status": "success",
            "file_name": filename,
            "lines_imported": lines_imported,
            "lines_skipped_as_duplicate": lines_skipped,
            "total_active_statements": db.query(StatementLine).count()
        }

    except Exception as db_err:
        db.rollback()
        logger.exception("Database error while importing statement lines")
        raise HTTPException(status_code=500, detail=f"Failed to save statement lines to database: {str(db_err)}")

@router.get("", response_model=List[StatementLineOut])
def list_statement_lines(
    limit: int = 100,
    current_user: User = Depends(require_roles("admin", "head", "finance", "scrutiny", "auditor")),
    db: Session = Depends(get_db)
):
    return db.query(StatementLine).order_by(StatementLine.date.desc()).limit(limit).all()

@router.post("/re-verify", response_model=dict)
def re_verify_all_claims(
    current_user: User = Depends(require_roles("admin", "head", "finance", "scrutiny")),
    db: Session = Depends(get_db)
):
    """
    Forces full reconciliation re-run across all payment claims against all bank statement lines.
    """
    claims = db.query(PaymentClaim).all()
    count = 0
    for c in claims:
        verify_payment_claim(db, c)
        count += 1
    db.commit()
    return {"status": "success", "reconciled_claims_count": count}
