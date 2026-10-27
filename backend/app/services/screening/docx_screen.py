"""
screening/docx_screen.py — Stage 1 safety screening for DOCX files.

Accepted: .docx only. Rejects: .doc, .docm
Checks: ZIP structure, entry count, uncompressed size, compression ratio,
        vbaProject.bin (macro indicator), external relationships, embedded OLE.

NO text extraction, NO external API calls.
"""
import zipfile
from pathlib import Path
from app.services.screening.common import ScreeningResult, with_timeout

_DOCX_SCREEN_TIMEOUT_S = 15


def screen_docx(
    path: Path,
    max_entries: int,
    max_uncompressed_mb: int,
    max_ratio: float,
) -> ScreeningResult:
    try:
        return with_timeout(
            _DOCX_SCREEN_TIMEOUT_S,
            _screen_docx_inner,
            path, max_entries, max_uncompressed_mb, max_ratio,
        )
    except Exception as exc:
        return ScreeningResult(
            passed=False,
            reason=f"DOCX safety check could not be completed: {type(exc).__name__}.",
            file_format="docx",
            details={"error": str(exc)[:200]},
        )


def _screen_docx_inner(
    path: Path,
    max_entries: int,
    max_uncompressed_mb: int,
    max_ratio: float,
) -> ScreeningResult:
    details: dict = {}

    # Must be a valid ZIP (OOXML)
    if not zipfile.is_zipfile(path):
        return ScreeningResult(
            passed=False,
            reason="File does not have a valid DOCX (ZIP/OOXML) structure.",
            file_format="docx",
        )

    with zipfile.ZipFile(path, "r") as zf:
        infos = zf.infolist()

        # Entry count limit (zip-bomb guard)
        entry_count = len(infos)
        details["zip_entry_count"] = entry_count
        if entry_count > max_entries:
            return ScreeningResult(
                passed=False,
                reason=f"DOCX contains {entry_count} internal entries; maximum is {max_entries}. The file may be malformed.",
                file_format="docx",
                details=details,
            )

        # Uncompressed size and compression ratio (zip-bomb guard)
        total_compressed = sum(i.compress_size for i in infos)
        total_uncompressed = sum(i.file_size for i in infos)
        details["compressed_bytes"] = total_compressed
        details["uncompressed_bytes"] = total_uncompressed
        uncompressed_mb = total_uncompressed / (1024 * 1024)
        if uncompressed_mb > max_uncompressed_mb:
            return ScreeningResult(
                passed=False,
                reason=f"DOCX uncompressed size ({uncompressed_mb:.1f} MB) exceeds the limit ({max_uncompressed_mb} MB).",
                file_format="docx",
                details=details,
            )
        if total_compressed > 0:
            ratio = total_uncompressed / total_compressed
            details["compression_ratio"] = round(ratio, 2)
            if ratio > max_ratio:
                return ScreeningResult(
                    passed=False,
                    reason=f"DOCX compression ratio ({ratio:.1f}x) is abnormally high (limit: {max_ratio}x). The file may be a zip-bomb.",
                    file_format="docx",
                    details=details,
                )

        # Collect entry names (treat as untrusted; do NOT put in prompts or exec)
        names = {i.filename for i in infos}

        # VBA macro detection
        has_vba = any("vbaProject.bin" in n for n in names)
        details["has_vba"] = has_vba
        if has_vba:
            return ScreeningResult(
                passed=False,
                reason="DOCX contains VBA macros (vbaProject.bin). Only macro-free DOCX files are accepted.",
                file_format="docx",
                details=details,
            )

        # Embedded OLE objects
        has_ole = any(
            n.startswith("word/embeddings/") or n.endswith(".bin")
            for n in names
            if "vbaProject" not in n
        )
        details["has_embedded_ole"] = has_ole

        # External relationships
        has_external_rels = False
        for name in names:
            if name.endswith(".rels"):
                try:
                    data = zf.read(name).decode("utf-8", errors="ignore")
                    if 'TargetMode="External"' in data:
                        has_external_rels = True
                        break
                except Exception:
                    continue
        details["has_external_relationships"] = has_external_rels
        if has_external_rels:
            return ScreeningResult(
                passed=False,
                reason="DOCX contains external relationships (links to remote resources). Plain DOCX without external links is required.",
                file_format="docx",
                details=details,
            )

        # Read safe metadata from docProps (treat values as untrusted strings)
        _read_docx_meta(zf, details)

    return ScreeningResult(passed=True, reason="", file_format="docx", details=details)


def _read_docx_meta(zf: zipfile.ZipFile, details: dict) -> None:
    """Read docProps/core.xml and docProps/app.xml metadata safely."""
    import xml.etree.ElementTree as ET
    for doc_props_name, tag_prefix, fields in [
        ("docProps/core.xml", "{http://schemas.openxmlformats.org/package/2006/metadata/core-properties}", {
            "creator": "creator",
            "lastModifiedBy": "lastModifiedBy",
            "revision": "revision",
            "created": "{http://purl.org/dc/terms/}created",
            "modified": "{http://purl.org/dc/terms/}modified",
        }),
        ("docProps/app.xml", "{http://schemas.openxmlformats.org/officeDocument/2006/extended-properties}", {
            "application": "Application",
            "totalTime": "TotalTime",
        }),
    ]:
        try:
            raw = zf.read(doc_props_name)
            root = ET.fromstring(raw)
            ns_map = {
                "cp": "http://schemas.openxmlformats.org/package/2006/metadata/core-properties",
                "dc": "http://purl.org/dc/elements/1.1/",
                "dcterms": "http://purl.org/dc/terms/",
                "ep": "http://schemas.openxmlformats.org/officeDocument/2006/extended-properties",
            }
            for out_key, xml_local in fields.items():
                # Try both with and without namespace prefix
                el = root.find(".//" + xml_local, ns_map)
                if el is None:
                    # Try direct local tag
                    for child in root.iter():
                        local = child.tag.split("}")[-1] if "}" in child.tag else child.tag
                        if local == xml_local.split("}")[-1] if "}" in xml_local else xml_local == local:
                            el = child
                            break
                if el is not None and el.text:
                    # Truncate to avoid storing unbounded metadata
                    details[f"meta_{out_key}"] = str(el.text)[:200]
        except Exception:
            continue
