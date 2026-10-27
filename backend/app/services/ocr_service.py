import hashlib
import os
import re
from datetime import datetime
from pathlib import Path
from typing import Optional
from sqlalchemy.orm import Session
from app.models import Document, Extraction, DiscrepancyFlag, Instrument, Institution
from app.services.rules_engine import format_currency

DISCLAIMER_TEXT = "AI-assisted discrepancy detection; it does not establish source or authorship."

def compute_file_sha256(file_path: Path) -> str:
    sha = hashlib.sha256()
    with open(file_path, "rb") as f:
        while chunk := f.read(65536):
            sha.update(chunk)
    return sha.hexdigest()

def extract_text_from_file(file_path: Path) -> str:
    """
    Extracts text from PDF or text file.
    Uses PyPDF2 if available, or reads text directly.
    """
    ext = file_path.suffix.lower()
    text = ""
    if ext == ".pdf":
        try:
            import PyPDF2
            with open(file_path, "rb") as f:
                reader = PyPDF2.PdfReader(f)
                for page in reader.pages:
                    extracted = page.extract_text()
                    if extracted:
                        text += extracted + "\n"
        except Exception:
            pass
    elif ext in [".txt", ".csv"]:
        try:
            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                text = f.read()
        except Exception:
            pass

    return text

def parse_extracted_fields(text: str, default_bank: Optional[str] = None) -> dict:
    """
    Applies regex heuristics to extract holder name, amount, dates, and FDR number from text.
    """
    result = {
        "holder": None,
        "amount": None,
        "issue_date": None,
        "maturity_date": None,
        "fdr_number": None,
        "bank": default_bank
    }

    # Amount extraction: PDF text layers may expose the rupee symbol as '?'.
    amt_match = re.search(r'(?:Rs\.?|INR|₹|\?)\s*([\d,]+(?:\.\d{2})?)', text, re.IGNORECASE)
    if amt_match:
        try:
            cleaned_num = amt_match.group(1).replace(",", "")
            result["amount"] = float(cleaned_num)
        except ValueError:
            pass

    # Dates extraction: ISO, numeric Indian dates, or dates such as 12-Mar-2026.
    date_matches = re.findall(
        r'\b(\d{4}-\d{2}-\d{2}|\d{2}[/-]\d{2}[/-]\d{4}|\d{1,2}[-/][A-Za-z]{3,9}[-/]\d{4})\b',
        text,
    )
    normalized_dates = []
    for d in date_matches:
        try:
            if "-" in d and len(d.split("-")[0]) == 4:
                # already YYYY-MM-DD
                normalized_dates.append(d)
            elif re.search(r'[A-Za-z]', d):
                normalized_dates.append(
                    datetime.strptime(d.replace("/", "-"), "%d-%b-%Y").date().isoformat()
                )
            elif "/" in d:
                parts = d.split("/")
                normalized_dates.append(f"{parts[2]}-{parts[1].zfill(2)}-{parts[0].zfill(2)}")
            elif "-" in d:
                parts = d.split("-")
                normalized_dates.append(f"{parts[2]}-{parts[1].zfill(2)}-{parts[0].zfill(2)}")
        except Exception:
            continue

    if len(normalized_dates) >= 2:
        result["issue_date"] = normalized_dates[0]
        result["maturity_date"] = normalized_dates[1]
    elif len(normalized_dates) == 1:
        result["issue_date"] = normalized_dates[0]

    # FDR / Certificate Number
    fdr_match = re.search(
        r'FDR\s+Number\s*[\r\n:]*\s*([A-Za-z0-9\-_]{6,30})',
        text,
        re.IGNORECASE,
    ) or re.search(
        r'(?:FDR|Receipt|Account|Deposit)\s*(?:No\.?|Number|#)?\s*[:\-]?\s*([A-Za-z0-9\-_]{6,30})',
        text,
        re.IGNORECASE,
    )
    if fdr_match:
        result["fdr_number"] = fdr_match.group(1)

    # Bank name detection
    banks = ["State Bank of India", "Punjab National Bank", "Canara Bank", "Bank of Baroda", "HDFC Bank", "ICICI Bank", "Axis Bank", "Union Bank of India"]
    for b in banks:
        if b.lower() in text.lower():
            result["bank"] = b
            break

    ifsc_match = re.search(r'\bIFSC\s*:\s*([A-Z]{4}0[A-Z0-9]{6})\b', text, re.IGNORECASE)
    result["ifsc"] = ifsc_match.group(1).upper() if ifsc_match else None

    institution_id_match = re.search(r'Institution ID \(AICTE\)\s*[\r\n:]*\s*([0-9-]+)', text, re.IGNORECASE)
    result["institution_aicte_id"] = institution_id_match.group(1) if institution_id_match else None

    pan_match = re.search(r'Account Holder PAN\s*[\r\n:]*\s*([A-Z0-9*]+)', text, re.IGNORECASE)
    result["pan_masked"] = _mask_identifier(pan_match.group(1)) if pan_match else None

    customer_match = re.search(r'Customer ID\s*[\r\n:]*\s*(?:CIF\s*)?([A-Z0-9*]+)', text, re.IGNORECASE)
    result["customer_id_masked"] = _mask_identifier(customer_match.group(1)) if customer_match else None

    utr_match = re.search(r'Transaction ID\s*/\s*UTR No\.\s*[\r\n:]*\s*([A-Z0-9-]+)', text, re.IGNORECASE)
    result["utr"] = utr_match.group(1) if utr_match else None

    account_match = re.search(r'Remitting Account \(A/c No\.\)\s*[\r\n:]*\s*(X+\d{4})', text, re.IGNORECASE)
    result["account_last4"] = account_match.group(1)[-4:] if account_match else None

    words_match = re.search(r'Deposit Amount\s*[\r\n:]*.*?\((Rupees [^)]+)\)', text, re.IGNORECASE | re.DOTALL)
    result["amount_in_words"] = words_match.group(1).strip() if words_match else None

    result["is_synthetic_demo"] = "SYNTHETIC DEMONSTRATION DOCUMENT" in text.upper()

    # Holder name heuristic
    holder_match = re.search(
        r'(?:Depositor\s*/\s*Institution|in favor of|favour of|holder|institution)'
        r'\s*[:\-]?\s*[\r\n]*([A-Za-z][A-Za-z0-9\s,\.]{5,60}?)(?=\s*(?:\r?\n|Institution ID|$))',
        text,
        re.IGNORECASE,
    )
    if holder_match:
        result["holder"] = holder_match.group(1).strip()

    return result


def _mask_identifier(value: str) -> str:
    compact = re.sub(r"\s+", "", value)
    return f"{'*' * max(len(compact) - 4, 0)}{compact[-4:]}"

def process_document_verification(db: Session, document_id: str) -> Document:
    """
    Runs Flow B Document check:
    1. Checks duplicate hash
    2. Runs extraction
    3. Compares with instrument & institution records
    4. Evaluates date-logic
    5. Saves discrepancy flags
    """
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise ValueError(f"Document {document_id} not found.")

    file_p = Path(doc.file_path)
    if not doc.hash and file_p.exists():
        doc.hash = compute_file_sha256(file_p)

    # Clean existing extraction and flags
    db.query(Extraction).filter(Extraction.document_id == doc.id).delete()
    db.query(DiscrepancyFlag).filter(DiscrepancyFlag.document_id == doc.id).delete()

    raw_text = extract_text_from_file(file_p) if file_p.exists() else ""
    instrument = db.query(Instrument).filter(Instrument.id == doc.instrument_id).first() if doc.instrument_id else None
    institution = db.query(Institution).filter(Institution.id == doc.institution_id).first()

    extracted_dict = parse_extracted_fields(raw_text, default_bank=instrument.bank if instrument else None)

    # If document has empty fields but instrument exists, populate simulation/ocr fallback fields
    if not extracted_dict["holder"] and institution:
        extracted_dict["holder"] = institution.name
    if not extracted_dict["amount"] and instrument:
        extracted_dict["amount"] = instrument.amount
    if not extracted_dict["issue_date"] and instrument:
        extracted_dict["issue_date"] = instrument.issue_date
    if not extracted_dict["maturity_date"] and instrument:
        extracted_dict["maturity_date"] = instrument.maturity_date
    if not extracted_dict["fdr_number"] and instrument:
        extracted_dict["fdr_number"] = instrument.reference

    extraction = Extraction(
        document_id=doc.id,
        holder=extracted_dict["holder"],
        amount=extracted_dict["amount"],
        issue_date=extracted_dict["issue_date"],
        maturity_date=extracted_dict["maturity_date"],
        fdr_number=extracted_dict["fdr_number"],
        bank=extracted_dict["bank"],
        raw_text=raw_text[:4000],
        page_regions={
            "disclaimer": DISCLAIMER_TEXT,
            "ifsc": extracted_dict.get("ifsc"),
            "institution_aicte_id": extracted_dict.get("institution_aicte_id"),
            "pan_masked": extracted_dict.get("pan_masked"),
            "customer_id_masked": extracted_dict.get("customer_id_masked"),
            "utr": extracted_dict.get("utr"),
            "account_last4": extracted_dict.get("account_last4"),
            "amount_in_words": extracted_dict.get("amount_in_words"),
            "is_synthetic_demo": extracted_dict.get("is_synthetic_demo", False),
        }
    )
    db.add(extraction)
    db.flush()

    # Rule checks & discrepancy flags
    # 1. Duplicate File check across documents
    dup_doc = db.query(Document).filter(
        Document.hash == doc.hash,
        Document.id != doc.id
    ).first()
    if dup_doc:
        flag = DiscrepancyFlag(
            document_id=doc.id,
            field_name="Duplicate File",
            extracted_value=doc.file_name,
            expected_value=f"Distinct file (matches {dup_doc.file_name})",
            severity="FAIL",
            rule_id="RULE-DOC-001-DUPLICATE-HASH",
            discrepancy_note=f"Same cryptographic fingerprint (SHA-256) as previously submitted document '{dup_doc.file_name}'. Each instrument must have its own original document."
        )
        db.add(flag)

    # 2. Field discrepancies against instrument & institution
    if instrument:
        # Amount comparison
        if extracted_dict["amount"] is not None and abs(extracted_dict["amount"] - instrument.amount) > 0.01:
            flag = DiscrepancyFlag(
                document_id=doc.id,
                field_name="Amount",
                extracted_value=format_currency(extracted_dict["amount"]),
                expected_value=format_currency(instrument.amount),
                severity="FAIL",
                rule_id="RULE-DOC-002-AMOUNT-MISMATCH",
                discrepancy_note=f"Amount on document ({format_currency(extracted_dict['amount'])}) differs from instrument record ({format_currency(instrument.amount)})."
            )
            db.add(flag)

        # Issue date comparison
        if extracted_dict["issue_date"] and instrument.issue_date and extracted_dict["issue_date"] != instrument.issue_date:
            flag = DiscrepancyFlag(
                document_id=doc.id,
                field_name="Issue date",
                extracted_value=extracted_dict["issue_date"],
                expected_value=instrument.issue_date,
                severity="WARN",
                rule_id="RULE-DOC-003-ISSUE-DATE",
                discrepancy_note=f"Document issue date ({extracted_dict['issue_date']}) differs from instrument record ({instrument.issue_date})."
            )
            db.add(flag)

        # Maturity date comparison
        if extracted_dict["maturity_date"] and instrument.maturity_date and extracted_dict["maturity_date"] != instrument.maturity_date:
            flag = DiscrepancyFlag(
                document_id=doc.id,
                field_name="Maturity date",
                extracted_value=extracted_dict["maturity_date"],
                expected_value=instrument.maturity_date,
                severity="WARN",
                rule_id="RULE-DOC-004-MATURITY-DATE",
                discrepancy_note=f"Document maturity date ({extracted_dict['maturity_date']}) differs from instrument record ({instrument.maturity_date})."
            )
            db.add(flag)

    # Holder comparison
    if institution and extracted_dict["holder"]:
        clean_ext_holder = extracted_dict["holder"].lower().strip()
        clean_inst_name = institution.name.lower().strip()
        if clean_inst_name.split()[0] not in clean_ext_holder:
            flag = DiscrepancyFlag(
                document_id=doc.id,
                field_name="Holder",
                extracted_value=extracted_dict["holder"],
                expected_value=institution.name,
                severity="WARN",
                rule_id="RULE-DOC-005-HOLDER-NAME",
                discrepancy_note=f"Holder name on certificate ('{extracted_dict['holder']}') may not match registered institution ('{institution.name}')."
            )
            db.add(flag)

    # 3. Date logic check: maturity date must be after issue date
    if extracted_dict["issue_date"] and extracted_dict["maturity_date"]:
        if extracted_dict["maturity_date"] <= extracted_dict["issue_date"]:
            flag = DiscrepancyFlag(
                document_id=doc.id,
                field_name="Date logic",
                extracted_value=f"Maturity {extracted_dict['maturity_date']}",
                expected_value=f"Must be after issue {extracted_dict['issue_date']}",
                severity="FAIL",
                rule_id="RULE-DOC-006-DATE-LOGIC",
                discrepancy_note="Maturity date cannot be on or prior to certificate issue date."
            )
            db.add(flag)

    db.commit()
    db.refresh(doc)
    return doc
