"""
screening/__init__.py — Dispatcher for Stage 1 format safety screening.

Usage:
    from app.services.screening import run_screening
    result = run_screening(path, declared_mime_type)

The dispatcher:
1. Validates extension allowlist and double-extension spoofing.
2. Validates file size.
3. Validates magic bytes vs declared extension.
4. Dispatches to the per-format screening module.

Returns a ScreeningResult with passed=True|False, reason, format, sha256, and details.
"""
from pathlib import Path
from typing import Optional

from app.services.screening.common import (
    ScreeningResult,
    check_extension_allowlist,
    check_file_size,
    check_magic_bytes,
    compute_sha256,
)
from app.config import settings
from app.services.screening.common import ALLOWED_MIME_MAP

# Antivirus hook stub — replace with real ClamAV/cloud AV integration in production
def _antivirus_stub(path: Path) -> tuple[bool, str]:
    """
    Stub for antivirus scanning.  In production, call ClamAV or cloud AV SDK here.
    Returns (clean: bool, detail: str).
    """
    return True, "AV_SCAN_STUB_NOT_CONFIGURED"


def run_screening(path: Path, declared_mime: Optional[str] = None) -> ScreeningResult:
    """
    Run Stage 1 safety screening on a quarantined file.

    Args:
        path: Path to the quarantined file (random filename, outside web root).
        declared_mime: MIME type reported by the client (untrusted; used only for
                       logging, not for format determination).

    Returns:
        ScreeningResult with passed=True if all checks pass, else False with reason.
    """
    # 1. Extension allowlist + double-extension check
    ok, reason, ext = check_extension_allowlist(path.name)
    if not ok:
        return _with_checks(ScreeningResult(passed=False, reason=reason, file_format=None), ext, declared_mime)

    # 2. File size
    ok, reason, size = check_file_size(path, settings.MAX_UPLOAD_MB)
    if not ok:
        return _with_checks(ScreeningResult(passed=False, reason=reason, file_format=None, file_size=size), ext, declared_mime)

    expected_mime = ALLOWED_MIME_MAP.get(ext)
    if declared_mime and expected_mime and declared_mime != expected_mime:
        return _with_checks(
            ScreeningResult(
                passed=False,
                reason="The file type does not match its declared format. Please choose the original file and try again.",
                file_format=None,
                file_size=size,
            ),
            ext,
            declared_mime,
        )

    # 3. Magic bytes
    ok, reason = check_magic_bytes(path, ext)
    if not ok:
        return _with_checks(ScreeningResult(passed=False, reason=reason, file_format=None, file_size=size), ext, declared_mime)

    # 4. Compute SHA-256 (after size/magic check to avoid reading huge malformed files)
    sha256 = compute_sha256(path)

    # 5. Antivirus hook
    av_clean, av_detail = _antivirus_stub(path)
    if not av_clean:
        return _with_checks(
            ScreeningResult(
                passed=False,
                reason=f"File was flagged by antivirus scan: {av_detail}",
                file_size=size,
                sha256=sha256,
            ),
            ext,
            declared_mime,
        )

    # 6. Per-format screening
    result = _dispatch(path, ext)
    result.file_size = size
    result.sha256 = sha256

    # Attach AV stub note to details
    if result.details is None:
        result.details = {}
    result.details["av_scan"] = av_detail
    return _with_checks(result, ext, declared_mime)


def _with_checks(result: ScreeningResult, ext: str, declared_mime: Optional[str]) -> ScreeningResult:
    """Attach user-safe, metadata-only checks to every screening outcome."""
    checks = [
        {
            "code": "FORMAT_ALLOWLIST",
            "status": "pass" if ext in settings.ALLOWED_EXTENSIONS else "fail",
            "message_user": "File type is accepted." if ext in settings.ALLOWED_EXTENSIONS else result.reason,
            "message_officer": result.reason if ext not in settings.ALLOWED_EXTENSIONS else "Extension is in the configured allowlist.",
            "evidence": {"extension": ext},
        },
        {
            "code": "FILE_SIZE",
            "status": "pass" if result.file_size and result.file_size <= settings.MAX_UPLOAD_MB * 1024 * 1024 else "fail",
            "message_user": "File size is within the configured limit." if result.file_size and result.file_size <= settings.MAX_UPLOAD_MB * 1024 * 1024 else result.reason,
            "message_officer": "Size limit check completed.",
            "evidence": {"bytes": result.file_size, "max_mb": settings.MAX_UPLOAD_MB},
        },
        {
            "code": "FORMAT_SIGNATURE",
            "status": "pass" if result.passed or result.file_format else "fail",
            "message_user": "File signature matches the selected format." if result.passed or result.file_format else result.reason,
            "message_officer": "Magic-byte check completed.",
            "evidence": {"file_format": result.file_format},
        },
    ]
    if declared_mime and ext in ALLOWED_MIME_MAP:
        mime_ok = declared_mime == ALLOWED_MIME_MAP[ext]
        checks.append({
            "code": "MIME_MATCH",
            "status": "pass" if mime_ok else "fail",
            "message_user": "Declared file type matches the file extension." if mime_ok else result.reason,
            "message_officer": "Client MIME type was compared with the configured MIME type.",
            "evidence": {"declared_mime": declared_mime, "expected_mime": ALLOWED_MIME_MAP[ext]},
        })
    details = dict(result.details or {})
    details["checks"] = checks
    result.details = details
    result.checks = checks
    return result


def _dispatch(path: Path, ext: str) -> ScreeningResult:
    """Dispatch to the correct per-format screener."""
    if ext == ".pdf":
        from app.services.screening.pdf_screen import screen_pdf
        return screen_pdf(path, max_pages=settings.PDF_MAX_PAGES)

    elif ext == ".docx":
        from app.services.screening.docx_screen import screen_docx
        return screen_docx(
            path,
            max_entries=settings.DOCX_MAX_ENTRIES,
            max_uncompressed_mb=settings.DOCX_MAX_UNCOMPRESSED_MB,
            max_ratio=settings.DOCX_MAX_RATIO,
        )

    elif ext == ".xlsx":
        from app.services.screening.xlsx_screen import screen_xlsx
        return screen_xlsx(
            path,
            max_entries=settings.XLSX_MAX_ENTRIES,
            max_uncompressed_mb=settings.XLSX_MAX_UNCOMPRESSED_MB,
            max_ratio=settings.XLSX_MAX_RATIO,
        )

    elif ext == ".csv":
        from app.services.screening.csv_screen import screen_csv
        return screen_csv(
            path,
            max_rows=settings.CSV_MAX_ROWS,
            max_cols=settings.CSV_MAX_COLS,
        )

    elif ext in {".jpg", ".jpeg", ".png", ".webp"}:
        from app.services.screening.image_screen import screen_image
        return screen_image(
            path,
            max_pixels=settings.IMG_MAX_PIXELS,
            max_dim=settings.IMG_MAX_DIM,
        )

    else:
        return ScreeningResult(
            passed=False,
            reason=f"No screener available for extension '{ext}'.",
            file_format=None,
        )
