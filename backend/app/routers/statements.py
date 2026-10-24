import hashlib
import io
import re
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import StatementLine, User
from app.schemas import StatementLineOut
from app.security import get_current_user, require_roles
from app.services.audit_service import log_audit

router = APIRouter(prefix="/statements", tags=["Bank Statements"])

def compute_line_hash(source_file: str, date_str: str, utr_str: str, amount_val: float, narr: str) -> str:
    content = f"{source_file}:{date_str}:{utr_str}:{amount_val:.2f}:{narr}"
    return hashlib.sha256(content.encode("utf-8")).hexdigest()

@router.post("/import", response_model=dict)
async def import_bank_statement(
    file: UploadFile = File(...),
    current_user: User = Depends(require_roles("admin", "head", "finance", "scrutiny")),
    db: Session = Depends(get_db)
):
    """
    Implements Feature 6: Bank statement import
    Uploads CSV, XLSX or PDF statements; normalises columns, de-duplicates lines, keeps source file and hash.
    """
    contents = await file.read()
    filename = file.filename or "statement_import.csv"
    ext = filename.split(".")[-1].lower()

    lines_imported = 0
    lines_skipped = 0

    if ext == "csv":
        try:
            text = contents.decode("utf-8", errors="ignore")
            reader = io.StringIO(text)
            import csv
            csv_reader = csv.reader(reader)
            header = next(csv_reader, None)

            # Look for columns: date, utr/ref, amount, narration
            for row in csv_reader:
                if len(row) < 4:
                    continue
                # Expected format: Date, UTR, Amount, Narration
                date_str = row[0].strip()
                utr_str = row[1].strip()
                try:
                    amount_val = float(row[2].replace(",", "").strip())
                except ValueError:
                    continue
                narration = row[3].strip()

                line_hash = compute_line_hash(filename, date_str, utr_str, amount_val, narration)
                existing = db.query(StatementLine).filter(StatementLine.hash == line_hash).first()
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
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to parse CSV: {str(e)}")

    elif ext in ["xlsx", "xls"]:
        try:
            import pandas as pd
            df = pd.read_excel(io.BytesIO(contents))
            # Normalize column names
            col_map = {col: str(col).lower().strip() for col in df.columns}
            df = df.rename(columns=col_map)

            # Map typical columns
            date_col = next((c for c in df.columns if "date" in c), df.columns[0])
            utr_col = next((c for c in df.columns if any(k in c for k in ["utr", "ref", "txn", "chq"])), df.columns[1])
            amt_col = next((c for c in df.columns if any(k in c for k in ["amt", "amount", "credit"])), df.columns[2])
            narr_col = next((c for c in df.columns if any(k in c for k in ["narr", "desc", "particular"])), df.columns[3])

            for _, r in df.iterrows():
                date_str = str(r[date_col]).strip()[:10]
                utr_str = str(r[utr_col]).strip()
                try:
                    amount_val = float(str(r[amt_col]).replace(",", "").strip())
                except Exception:
                    continue
                narration = str(r[narr_col]).strip()

                line_hash = compute_line_hash(filename, date_str, utr_str, amount_val, narration)
                existing = db.query(StatementLine).filter(StatementLine.hash == line_hash).first()
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
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to parse Excel statement: {str(e)}")

    else:
        # Default text / fallback format parsing
        text = contents.decode("utf-8", errors="ignore")
        for line in text.splitlines():
            parts = re.split(r'[,;\t|]', line)
            if len(parts) >= 4:
                date_str = parts[0].strip()
                utr_str = parts[1].strip()
                try:
                    amount_val = float(parts[2].replace(",", "").strip())
                except ValueError:
                    continue
                narration = parts[3].strip()

                line_hash = compute_line_hash(filename, date_str, utr_str, amount_val, narration)
                existing = db.query(StatementLine).filter(StatementLine.hash == line_hash).first()
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

    return {
        "status": "success",
        "file_name": filename,
        "lines_imported": lines_imported,
        "lines_skipped_as_duplicate": lines_skipped,
        "total_active_statements": db.query(StatementLine).count()
    }

@router.get("", response_model=List[StatementLineOut])
def list_statement_lines(
    limit: int = 100,
    current_user: User = Depends(require_roles("admin", "head", "finance", "scrutiny", "auditor")),
    db: Session = Depends(get_db)
):
    return db.query(StatementLine).order_by(StatementLine.date.desc()).limit(limit).all()
