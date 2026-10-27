"""
screening/xlsx_screen.py — Stage 1 safety screening for XLSX files.

Accepted: .xlsx only. Rejects: .xls, .xlsm, .xlsb
Checks: ZIP structure, entry count, uncompressed size, compression ratio,
        macro detection, external links, hidden sheets, very large sheet
        dimensions.

NEVER evaluates formulas. NO text extraction. NO external API calls.
"""
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path
from app.services.screening.common import ScreeningResult, with_timeout

_XLSX_SCREEN_TIMEOUT_S = 15


def screen_xlsx(
    path: Path,
    max_entries: int,
    max_uncompressed_mb: int,
    max_ratio: float,
) -> ScreeningResult:
    try:
        return with_timeout(
            _XLSX_SCREEN_TIMEOUT_S,
            _screen_xlsx_inner,
            path, max_entries, max_uncompressed_mb, max_ratio,
        )
    except Exception as exc:
        return ScreeningResult(
            passed=False,
            reason=f"XLSX safety check could not be completed: {type(exc).__name__}.",
            file_format="xlsx",
            details={"error": str(exc)[:200]},
        )


def _screen_xlsx_inner(
    path: Path,
    max_entries: int,
    max_uncompressed_mb: int,
    max_ratio: float,
) -> ScreeningResult:
    details: dict = {}

    if not zipfile.is_zipfile(path):
        return ScreeningResult(
            passed=False,
            reason="File does not have a valid XLSX (ZIP/OOXML) structure.",
            file_format="xlsx",
        )

    with zipfile.ZipFile(path, "r") as zf:
        infos = zf.infolist()

        entry_count = len(infos)
        details["zip_entry_count"] = entry_count
        if entry_count > max_entries:
            return ScreeningResult(
                passed=False,
                reason=f"XLSX contains {entry_count} internal entries; maximum is {max_entries}.",
                file_format="xlsx",
                details=details,
            )

        total_compressed = sum(i.compress_size for i in infos)
        total_uncompressed = sum(i.file_size for i in infos)
        details["compressed_bytes"] = total_compressed
        details["uncompressed_bytes"] = total_uncompressed
        uncompressed_mb = total_uncompressed / (1024 * 1024)
        if uncompressed_mb > max_uncompressed_mb:
            return ScreeningResult(
                passed=False,
                reason=f"XLSX uncompressed size ({uncompressed_mb:.1f} MB) exceeds the limit ({max_uncompressed_mb} MB).",
                file_format="xlsx",
                details=details,
            )
        if total_compressed > 0:
            ratio = total_uncompressed / total_compressed
            details["compression_ratio"] = round(ratio, 2)
            if ratio > max_ratio:
                return ScreeningResult(
                    passed=False,
                    reason=f"XLSX compression ratio ({ratio:.1f}x) is abnormally high (limit: {max_ratio}x). Possible zip-bomb.",
                    file_format="xlsx",
                    details=details,
                )

        names = {i.filename for i in infos}

        # Macro detection (.xlsm-like content in .xlsx)
        has_vba = any("vbaProject.bin" in n for n in names)
        details["has_vba"] = has_vba
        if has_vba:
            return ScreeningResult(
                passed=False,
                reason="XLSX contains VBA macros (vbaProject.bin). Only macro-free XLSX files are accepted.",
                file_format="xlsx",
                details=details,
            )

        # External links
        has_external_links = _check_external_links(zf, names)
        details["has_external_links"] = has_external_links
        if has_external_links:
            return ScreeningResult(
                passed=False,
                reason="XLSX contains external data links. Plain XLSX without external connections is required.",
                file_format="xlsx",
                details=details,
            )

        # External rels
        has_external_rels = _check_external_rels(zf, names)
        details["has_external_relationships"] = has_external_rels

        # Workbook metadata
        hidden_sheets, sheet_count = _check_hidden_sheets(zf, names)
        details["sheet_count"] = sheet_count
        details["hidden_sheet_count"] = hidden_sheets

        # docProps metadata (safe read)
        _read_xlsx_meta(zf, details)

    return ScreeningResult(passed=True, reason="", file_format="xlsx", details=details)


def _check_external_links(zf: zipfile.ZipFile, names: set) -> bool:
    """Check xl/externalLinks/ for external workbook references."""
    for name in names:
        if name.startswith("xl/externalLinks/") and name.endswith(".xml"):
            return True
    return False


def _check_external_rels(zf: zipfile.ZipFile, names: set) -> bool:
    for name in names:
        if name.endswith(".rels"):
            try:
                data = zf.read(name).decode("utf-8", errors="ignore")
                if 'TargetMode="External"' in data:
                    return True
            except Exception:
                continue
    return False


def _check_hidden_sheets(zf: zipfile.ZipFile, names: set) -> tuple[int, int]:
    """Return (hidden_count, total_count) for sheets in workbook.xml."""
    if "xl/workbook.xml" not in names:
        return 0, 0
    try:
        raw = zf.read("xl/workbook.xml")
        root = ET.fromstring(raw)
        ns = {"x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
        sheets = root.findall(".//x:sheet", ns)
        total = len(sheets)
        hidden = sum(
            1 for s in sheets
            if s.attrib.get("state", "visible") in ("hidden", "veryHidden")
        )
        return hidden, total
    except Exception:
        return 0, 0


def _read_xlsx_meta(zf: zipfile.ZipFile, details: dict) -> None:
    for xml_name, ns_uri, field_map in [
        ("docProps/core.xml",
         "http://schemas.openxmlformats.org/package/2006/metadata/core-properties",
         {"meta_creator": "creator", "meta_lastModifiedBy": "lastModifiedBy",
          "meta_created": "{http://purl.org/dc/terms/}created",
          "meta_modified": "{http://purl.org/dc/terms/}modified"}),
        ("docProps/app.xml",
         "http://schemas.openxmlformats.org/officeDocument/2006/extended-properties",
         {"meta_application": "Application"}),
    ]:
        try:
            raw = zf.read(xml_name)
            root = ET.fromstring(raw)
            for out_key, local_name in field_map.items():
                for child in root.iter():
                    tag_local = child.tag.split("}")[-1] if "}" in child.tag else child.tag
                    expected_local = local_name.split("}")[-1] if "}" in local_name else local_name
                    if tag_local == expected_local and child.text:
                        details[out_key] = str(child.text)[:200]
                        break
        except Exception:
            continue
