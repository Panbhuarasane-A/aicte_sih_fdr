"""
screening/common.py — Shared helpers for Stage 1 safety screening.

Rules followed:
- Only safe operations: size, magic bytes, archive structure, macro detection,
  metadata reads.
- NO text extraction, NO OCR, NO LLM calls, NO external API calls.
- Hard timeouts and resource guards on every parser call.
- Treat all filename/metadata strings as untrusted data.
"""
import hashlib
import os
import signal
import struct
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

# Magic byte signatures: maps extension -> list of accepted byte prefixes
MAGIC_BYTES: dict[str, list[bytes]] = {
    ".pdf":  [b"%PDF"],
    ".docx": [b"PK\x03\x04"],   # OOXML (ZIP)
    ".xlsx": [b"PK\x03\x04"],   # OOXML (ZIP)
    ".csv":  [],                  # no magic; validated by content check
    ".jpg":  [b"\xff\xd8\xff"],
    ".jpeg": [b"\xff\xd8\xff"],
    ".png":  [b"\x89PNG\r\n\x1a\n"],
    ".webp": [b"RIFF"],          # RIFF....WEBP
}

ALLOWED_MIME_MAP: dict[str, str] = {
    ".pdf":  "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".csv":  "text/csv",
    ".jpg":  "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png":  "image/png",
    ".webp": "image/webp",
}

# File format labels returned in gate state / screening result
FORMAT_LABELS: dict[str, str] = {
    ".pdf":  "pdf",
    ".docx": "docx",
    ".xlsx": "xlsx",
    ".csv":  "csv",
    ".jpg":  "jpg",
    ".jpeg": "jpg",
    ".png":  "png",
    ".webp": "webp",
}

FORBIDDEN_EXTENSIONS = {".doc", ".docm", ".xls", ".xlsm", ".xlsb", ".exe",
                        ".bat", ".sh", ".ps1", ".vbs", ".js", ".jar"}


@dataclass
class ScreeningResult:
    """Outcome of Stage 1 safety screening."""
    passed: bool
    reason: str                         # plain-language reason (shown to institution if failed)
    file_format: Optional[str] = None   # pdf | docx | xlsx | csv | jpg | png | webp
    sha256: Optional[str] = None
    file_size: int = 0
    details: dict = field(default_factory=dict)  # additional metadata-safe indicators
    checks: list[dict] = field(default_factory=list)


def compute_sha256(path: Path) -> str:
    sha = hashlib.sha256()
    with open(path, "rb") as fh:
        while chunk := fh.read(65536):
            sha.update(chunk)
    return sha.hexdigest()


def check_magic_bytes(path: Path, ext: str) -> tuple[bool, str]:
    """Verify first bytes match the declared extension."""
    expected = MAGIC_BYTES.get(ext)
    if expected is None:
        return False, f"Extension '{ext}' is not in the allowed list."
    if not expected:
        # No magic signature (CSV): accept
        return True, ""
    with open(path, "rb") as fh:
        header = fh.read(16)
    if ext == ".webp":
        # RIFF????WEBP
        if header[:4] == b"RIFF" and header[8:12] == b"WEBP":
            return True, ""
        return False, "File does not have a valid WEBP signature."
    for sig in expected:
        if header[:len(sig)] == sig:
            return True, ""
    return False, f"File magic bytes do not match declared extension '{ext}'."


def check_extension_allowlist(filename: str) -> tuple[bool, str, str]:
    """
    Returns (allowed, reason, normalised_ext).
    Checks extension against allowlist and rejects forbidden types.
    Strips only the final extension to prevent double-extension spoofing.
    """
    # Use only the LAST suffix to resist double-extension attacks (.pdf.exe -> .exe)
    name = Path(filename).name
    parts = name.split(".")
    if len(parts) < 2:
        return False, "File has no extension.", ""
    ext = "." + parts[-1].lower()
    if ext in FORBIDDEN_EXTENSIONS:
        return False, f"File type '{ext}' is not accepted. Rejected types include executable and macro-enabled formats.", ext
    from app.config import settings
    if ext not in settings.ALLOWED_EXTENSIONS:
        return False, (
            f"File type '{ext}' is not in the accepted list. "
            "Accepted: PDF, DOCX, XLSX, CSV, JPG, PNG, WEBP."
        ), ext
    return True, "", ext


def check_file_size(path: Path, max_mb: int) -> tuple[bool, str, int]:
    size = path.stat().st_size
    max_bytes = max_mb * 1024 * 1024
    if size == 0:
        return False, "File is empty.", size
    if size > max_bytes:
        return False, f"File size ({size // (1024*1024)} MB) exceeds the maximum allowed ({max_mb} MB).", size
    return True, "", size


class TimeoutError(Exception):
    pass


def _timeout_handler(signum, frame):
    raise TimeoutError("Screening parser timed out.")


def with_timeout(seconds: int, fn, *args, **kwargs):
    """
    Runs fn(*args, **kwargs) with a wall-clock timeout on Unix.
    On Windows (no SIGALRM), falls back to best-effort (no signal timeout).
    """
    if hasattr(signal, "SIGALRM"):
        old = signal.signal(signal.SIGALRM, _timeout_handler)
        signal.alarm(seconds)
        try:
            return fn(*args, **kwargs)
        finally:
            signal.alarm(0)
            signal.signal(signal.SIGALRM, old)
    else:
        # Windows: run without hard SIGALRM; rely on library-level limits
        return fn(*args, **kwargs)
