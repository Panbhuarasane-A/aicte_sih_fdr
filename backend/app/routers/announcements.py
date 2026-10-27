from pathlib import Path
from typing import Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import Announcement, Institution, User
from app.schemas import AnnouncementOut
from app.security import enforce_institution_or_region_access, get_current_user, require_roles

router = APIRouter(prefix="/announcements", tags=["Announcements"])
ALLOWED_EXTENSIONS = {".pdf", ".ppt", ".pptx"}
MAX_ATTACHMENT_BYTES = settings.MAX_UPLOAD_MB * 1024 * 1024


@router.get("", response_model=list[AnnouncementOut])
def list_announcements(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Announcement).order_by(Announcement.created_at.desc())
    if current_user.role == "institution":
        query = query.filter(
            (Announcement.institution_id.is_(None))
            | (Announcement.institution_id == current_user.institution_id)
        )
    elif current_user.role == "scrutiny" and current_user.region_scope:
        query = query.join(Institution, Announcement.institution_id == Institution.id, isouter=True).filter(
            (Announcement.institution_id.is_(None))
            | (Institution.region == current_user.region_scope)
        )
    return query.all()


@router.get("/{announcement_id}/attachments/{attachment_index}")
def download_attachment(
    announcement_id: str,
    attachment_index: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    announcement = db.query(Announcement).filter(Announcement.id == announcement_id).first()
    if not announcement:
        raise HTTPException(status_code=404, detail="Announcement not found")
    if current_user.role == "institution":
        if announcement.institution_id not in (None, current_user.institution_id):
            raise HTTPException(status_code=403, detail="Access denied")
    elif current_user.role == "scrutiny" and announcement.institution_id:
        institution = db.query(Institution).filter(Institution.id == announcement.institution_id).first()
        if not institution:
            raise HTTPException(status_code=404, detail="Announcement institution not found")
        enforce_institution_or_region_access(current_user, institution)

    attachments = announcement.attachments or []
    if attachment_index < 0 or attachment_index >= len(attachments):
        raise HTTPException(status_code=404, detail="Attachment not found")
    metadata = attachments[attachment_index]
    relative_path = Path(metadata.get("path", ""))
    upload_root = settings.UPLOAD_DIR.resolve()
    file_path = (upload_root / relative_path).resolve()
    if upload_root not in file_path.parents or not file_path.is_file():
        raise HTTPException(status_code=404, detail="Attachment file not found")
    return FileResponse(
        file_path,
        media_type=metadata.get("content_type") or "application/octet-stream",
        filename=metadata.get("name") or file_path.name,
    )


@router.delete("/{announcement_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_announcement(
    announcement_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    announcement = db.query(Announcement).filter(Announcement.id == announcement_id).first()
    if not announcement:
        raise HTTPException(status_code=404, detail="Announcement not found")
    if current_user.role not in {"institution", "admin", "head"}:
        raise HTTPException(status_code=403, detail="You are not allowed to remove announcements")

    upload_root = settings.UPLOAD_DIR.resolve()
    for metadata in announcement.attachments or []:
        file_path = (upload_root / Path(metadata.get("path", ""))).resolve()
        if upload_root in file_path.parents and file_path.is_file():
            file_path.unlink()
    db.delete(announcement)
    db.commit()


@router.post("", response_model=AnnouncementOut, status_code=status.HTTP_201_CREATED)
async def create_announcement(
    title: str = Form(..., min_length=1, max_length=255),
    description: str = Form(..., min_length=1, max_length=1000),
    institution_id: Optional[str] = Form(None),
    files: list[UploadFile] = File(default=[]),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("admin", "head", "scrutiny")),
):
    if institution_id:
        institution = db.query(Institution).filter(Institution.id == institution_id).first()
        if not institution:
            raise HTTPException(status_code=404, detail="Institution not found")
        enforce_institution_or_region_access(current_user, institution)

    attachment_metadata = []
    announcement_dir = settings.UPLOAD_DIR / "announcements"
    announcement_dir.mkdir(parents=True, exist_ok=True)
    for upload in files:
        suffix = Path(upload.filename or "").suffix.lower()
        if suffix not in ALLOWED_EXTENSIONS:
            raise HTTPException(status_code=400, detail=f"Unsupported attachment type: {suffix or 'unknown'}")
        content = await upload.read()
        if len(content) > MAX_ATTACHMENT_BYTES:
            raise HTTPException(status_code=413, detail=f"Attachment exceeds {settings.MAX_UPLOAD_MB} MB limit")
        stored_name = f"{uuid4()}{suffix}"
        destination = announcement_dir / stored_name
        destination.write_bytes(content)
        attachment_metadata.append({
            "name": upload.filename,
            "path": str(destination.relative_to(settings.UPLOAD_DIR)),
            "size": len(content),
            "content_type": upload.content_type,
        })

    announcement = Announcement(
        title=title.strip(),
        description=description.strip(),
        institution_id=institution_id,
        created_by=current_user.id,
        attachments=attachment_metadata,
    )
    db.add(announcement)
    db.commit()
    db.refresh(announcement)
    return announcement
