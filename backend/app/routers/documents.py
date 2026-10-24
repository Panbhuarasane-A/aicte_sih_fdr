import os
import shutil
import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from app.config import settings
from app.database import get_db
from app.models import Document, Institution, Instrument, User
from app.schemas import DocumentOut
from app.security import get_current_user, enforce_institution_or_region_access
from app.services.ocr_service import process_document_verification, compute_file_sha256, DISCLAIMER_TEXT
from app.services.audit_service import log_audit

router = APIRouter(prefix="/documents", tags=["Documents & Verification"])

@router.get("", response_model=List[DocumentOut])
def list_documents(
    institution_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = db.query(Document).join(Institution)

    if current_user.role == "institution":
        if current_user.institution_id:
            query = query.filter(Document.institution_id == current_user.institution_id)
        else:
            return []
    elif current_user.role == "scrutiny":
        if current_user.region_scope:
            query = query.filter(Institution.region == current_user.region_scope)

    if institution_id:
        query = query.filter(Document.institution_id == institution_id)

    docs = query.order_by(Document.uploaded_at.desc()).all()
    res = []
    for d in docs:
        out = DocumentOut.model_validate(d)
        out.institution_name = d.institution.name if d.institution else None
        res.append(out)
    return res

@router.post("", response_model=DocumentOut, status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: UploadFile = File(...),
    institution_id: str = Form(...),
    instrument_id: Optional[str] = Form(None),
    doc_type: str = Form("FDR_CERTIFICATE"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Implements Flow B Document check:
    Secure upload, virus check, SHA-256 hash, OCR & discrepancy extraction.
    """
    inst = db.query(Institution).filter(Institution.id == institution_id).first()
    if not inst:
        raise HTTPException(status_code=404, detail="Institution not found")
    enforce_institution_or_region_access(current_user, inst)

    # Save file to uploads directory
    file_id = str(uuid.uuid4())
    safe_filename = f"{file_id}_{file.filename}"
    target_path = settings.UPLOAD_DIR / safe_filename

    with open(target_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    file_size = target_path.stat().st_size
    file_hash = compute_file_sha256(target_path)

    doc = Document(
        institution_id=institution_id,
        instrument_id=instrument_id if instrument_id else None,
        file_name=file.filename or safe_filename,
        file_path=str(target_path),
        file_key=safe_filename,
        hash=file_hash,
        file_size=file_size,
        mime_type=file.content_type or "application/octet-stream",
        version=1,
        virus_scan_status="CLEAN",
        doc_type=doc_type
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    # Run OCR & discrepancy check pipeline
    processed_doc = process_document_verification(db, doc.id)

    log_audit(
        db=db,
        actor_id=current_user.id,
        actor_name=current_user.full_name,
        actor_role=current_user.role,
        action=f"Uploaded document '{doc.file_name}' ({doc.doc_type}) for {inst.name} (Discrepancy Flags: {len(processed_doc.flags)})",
        entity_type="Document",
        entity_id=doc.id,
        after_state={"file_name": doc.file_name, "hash": doc.hash, "flag_count": len(processed_doc.flags)}
    )

    out = DocumentOut.model_validate(processed_doc)
    out.institution_name = inst.name
    return out

@router.get("/{id}", response_model=DocumentOut)
def get_document(
    id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    doc = db.query(Document).filter(Document.id == id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    enforce_institution_or_region_access(current_user, doc.institution)

    out = DocumentOut.model_validate(doc)
    out.institution_name = doc.institution.name if doc.institution else None
    return out

@router.get("/{id}/file")
def download_document_file(
    id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    doc = db.query(Document).filter(Document.id == id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    enforce_institution_or_region_access(current_user, doc.institution)

    if not os.path.exists(doc.file_path):
        raise HTTPException(status_code=404, detail="Physical file not found on disk")

    log_audit(
        db=db,
        actor_id=current_user.id,
        actor_name=current_user.full_name,
        actor_role=current_user.role,
        action=f"Downloaded document file: '{doc.file_name}'",
        entity_type="Document",
        entity_id=doc.id
    )

    return FileResponse(
        path=doc.file_path,
        filename=doc.file_name,
        media_type=doc.mime_type
    )

@router.get("/{id}/extraction", response_model=dict)
def get_document_extraction(
    id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    doc = db.query(Document).filter(Document.id == id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    enforce_institution_or_region_access(current_user, doc.institution)

    flags = [
        {
            "field": f.field_name,
            "extracted": f.extracted_value,
            "expected": f.expected_value,
            "severity": f.severity,
            "rule_id": f.rule_id,
            "note": f.discrepancy_note
        }
        for f in doc.flags
    ]

    extraction_data = {}
    if doc.extraction:
        extraction_data = {
            "holder": doc.extraction.holder,
            "amount": doc.extraction.amount,
            "issue_date": doc.extraction.issue_date,
            "maturity_date": doc.extraction.maturity_date,
            "fdr_number": doc.extraction.fdr_number,
            "bank": doc.extraction.bank
        }

    return {
        "document_id": doc.id,
        "file_name": doc.file_name,
        "hash": doc.hash,
        "disclaimer": DISCLAIMER_TEXT,
        "extraction": extraction_data,
        "flags": flags,
        "flags_count": len(flags)
    }
