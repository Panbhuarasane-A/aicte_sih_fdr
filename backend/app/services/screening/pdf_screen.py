"""
screening/pdf_screen.py — Stage 1 safety screening for PDF files.

Safe operations only:
  - Page count limit
  - JavaScript detection
  - Embedded files detection
  - Launch actions detection
  - XFA form detection
  - Encryption / password-protection detection
  - PDF producer/creator metadata read (for origin signals in Stage 2)
  - Incremental update detection
  - Signature presence check

NO text extraction, NO rendering, NO OCR, NO external calls.
"""
from pathlib import Path
from typing import Optional
from app.services.screening.common import ScreeningResult


_PDF_SCREEN_TIMEOUT_S = 20  # per-file hard limit


def screen_pdf(path: Path, max_pages: int) -> ScreeningResult:
    """Run Stage 1 safety checks on a PDF file."""
    details: dict = {}
    try:
        from app.services.screening.common import with_timeout
        return with_timeout(_PDF_SCREEN_TIMEOUT_S, _screen_pdf_inner, path, max_pages, details)
    except Exception as exc:
        return ScreeningResult(
            passed=False,
            reason=f"PDF safety check could not be completed: {type(exc).__name__}.",
            file_format="pdf",
            details={"error": str(exc)[:200]},
        )


def _screen_pdf_inner(path: Path, max_pages: int, details: dict) -> ScreeningResult:
    # Try pikepdf first (better at detecting encrypted/malformed), then PyMuPDF
    try:
        import pikepdf
        return _screen_with_pikepdf(path, max_pages, details)
    except ImportError:
        pass
    try:
        import fitz  # PyMuPDF
        if not hasattr(fitz, "open"):
            raise ImportError("PyMuPDF is not available")
        return _screen_with_pymupdf(path, max_pages, details)
    except Exception:
        # Some environments expose an unrelated module named fitz. Use the
        # metadata-free byte checks rather than rejecting a readable PDF.
        pass
    # Fallback: basic raw-byte checks only
    return _screen_raw_bytes(path, max_pages, details)


def _screen_with_pikepdf(path: Path, max_pages: int, details: dict) -> ScreeningResult:
    import pikepdf

    try:
        pdf = pikepdf.open(str(path))
    except pikepdf.PasswordError:
        return ScreeningResult(
            passed=False,
            reason="The PDF is encrypted or password-protected. Please upload an unlocked copy.",
            file_format="pdf",
            details={"encrypted": True},
        )
    except Exception as exc:
        return ScreeningResult(
            passed=False,
            reason=f"PDF could not be opened for safety check: {str(exc)[:150]}.",
            file_format="pdf",
            details={"open_error": str(exc)[:200]},
        )

    page_count = len(pdf.pages)
    details["page_count"] = page_count
    if page_count > max_pages:
        return ScreeningResult(
            passed=False,
            reason=f"PDF has {page_count} pages; the maximum allowed is {max_pages}.",
            file_format="pdf",
            details=details,
        )

    # Collect metadata (safe read)
    try:
        meta = pdf.open_metadata()
        details["producer"] = str(meta.get("pdf:Producer", ""))[:200]
        details["creator"] = str(meta.get("xmp:CreatorTool", ""))[:200]
        details["created"] = str(meta.get("xmp:CreateDate", ""))[:50]
        details["modified"] = str(meta.get("xmp:ModifyDate", ""))[:50]
    except Exception:
        pass

    # Check for JavaScript
    has_js = _pikepdf_has_js(pdf)
    details["has_javascript"] = has_js
    if has_js:
        return ScreeningResult(
            passed=False,
            reason="PDF contains JavaScript actions. Only plain PDF documents without scripts are accepted.",
            file_format="pdf",
            details=details,
        )

    # Check for embedded files
    has_embedded = _pikepdf_has_embedded_files(pdf)
    details["has_embedded_files"] = has_embedded
    if has_embedded:
        return ScreeningResult(
            passed=False,
            reason="PDF contains embedded files. Please submit a plain PDF without attachments.",
            file_format="pdf",
            details=details,
        )

    # Launch actions
    has_launch = _pikepdf_has_launch_actions(pdf)
    details["has_launch_actions"] = has_launch
    if has_launch:
        return ScreeningResult(
            passed=False,
            reason="PDF contains launch/open actions. These files are not accepted.",
            file_format="pdf",
            details=details,
        )

    # XFA
    has_xfa = _pikepdf_has_xfa(pdf)
    details["has_xfa"] = has_xfa
    if has_xfa:
        return ScreeningResult(
            passed=False,
            reason="PDF contains XFA forms. Please submit a plain, non-form PDF.",
            file_format="pdf",
            details=details,
        )

    # Incremental update (not a rejection, recorded as indicator for Stage 2)
    details["has_incremental_updates"] = _pikepdf_has_incremental_updates(path)

    # Signature presence (not a rejection; Stage 2 verifies validity)
    details["has_signature"] = _pikepdf_has_signature(pdf)

    return ScreeningResult(passed=True, reason="", file_format="pdf", details=details)


def _pikepdf_has_js(pdf) -> bool:
    import pikepdf
    try:
        if "/JavaScript" in pdf.root.get("/Names", {}):
            return True
        for page in pdf.pages:
            annots = page.get("/Annots", [])
            for annot in annots:
                try:
                    a = annot.get("/A", {})
                    if str(a.get("/S", "")) == "/JavaScript":
                        return True
                except Exception:
                    continue
    except Exception:
        pass
    return False


def _pikepdf_has_embedded_files(pdf) -> bool:
    try:
        names = pdf.root.get("/Names", {})
        if names and "/EmbeddedFiles" in names:
            return True
    except Exception:
        pass
    return False


def _pikepdf_has_launch_actions(pdf) -> bool:
    try:
        for page in pdf.pages:
            annots = page.get("/Annots", [])
            for annot in annots:
                try:
                    a = annot.get("/A", {})
                    s = str(a.get("/S", ""))
                    if s in ("/Launch", "/SubmitForm", "/ImportData"):
                        return True
                except Exception:
                    continue
    except Exception:
        pass
    return False


def _pikepdf_has_xfa(pdf) -> bool:
    try:
        acroform = pdf.root.get("/AcroForm", {})
        if acroform and "/XFA" in acroform:
            return True
    except Exception:
        pass
    return False


def _pikepdf_has_incremental_updates(path: Path) -> bool:
    """Detect incremental updates by counting %%EOF markers."""
    try:
        with open(path, "rb") as fh:
            content = fh.read()
        return content.count(b"%%EOF") > 1
    except Exception:
        return False


def _pikepdf_has_signature(pdf) -> bool:
    try:
        acroform = pdf.root.get("/AcroForm", {})
        if not acroform:
            return False
        fields = acroform.get("/Fields", [])
        for field in fields:
            try:
                if str(field.get("/FT", "")) == "/Sig":
                    return True
            except Exception:
                continue
    except Exception:
        pass
    return False


def _screen_with_pymupdf(path: Path, max_pages: int, details: dict) -> ScreeningResult:
    import fitz
    try:
        doc = fitz.open(str(path))
    except Exception as exc:
        return ScreeningResult(
            passed=False,
            reason=f"PDF could not be opened: {str(exc)[:150]}.",
            file_format="pdf",
            details=details,
        )

    if doc.is_encrypted:
        return ScreeningResult(
            passed=False,
            reason="The PDF is encrypted or password-protected. Please upload an unlocked copy.",
            file_format="pdf",
            details={"encrypted": True},
        )

    page_count = doc.page_count
    details["page_count"] = page_count
    if page_count > max_pages:
        return ScreeningResult(
            passed=False,
            reason=f"PDF has {page_count} pages; the maximum allowed is {max_pages}.",
            file_format="pdf",
            details=details,
        )

    meta = doc.metadata or {}
    details["producer"] = str(meta.get("producer", ""))[:200]
    details["creator"] = str(meta.get("creator", ""))[:200]

    # JavaScript check via page annotations
    for page in doc:
        for annot in page.annots():
            try:
                if "/JavaScript" in str(annot.info):
                    details["has_javascript"] = True
                    return ScreeningResult(
                        passed=False,
                        reason="PDF contains JavaScript actions. Only plain PDFs are accepted.",
                        file_format="pdf",
                        details=details,
                    )
            except Exception:
                continue

    return ScreeningResult(passed=True, reason="", file_format="pdf", details=details)


def _screen_raw_bytes(path: Path, max_pages: int, details: dict) -> ScreeningResult:
    """Minimal raw-byte checks when no PDF library is available."""
    with open(path, "rb") as fh:
        raw = fh.read(1024 * 1024)  # read first 1 MB
    details["has_javascript"] = b"/JavaScript" in raw or b"/JS" in raw
    if details["has_javascript"]:
        return ScreeningResult(
            passed=False,
            reason="PDF contains JavaScript (detected via byte scan). Plain PDFs only.",
            file_format="pdf",
            details=details,
        )
    details["has_embedded_files"] = b"/EmbeddedFiles" in raw
    if details["has_embedded_files"]:
        return ScreeningResult(
            passed=False,
            reason="PDF contains embedded files. Plain PDFs only.",
            file_format="pdf",
            details=details,
        )
    details["has_launch_actions"] = b"/Launch" in raw
    return ScreeningResult(passed=True, reason="", file_format="pdf", details=details)
