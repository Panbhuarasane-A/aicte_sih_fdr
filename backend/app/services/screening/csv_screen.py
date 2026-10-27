"""
screening/csv_screen.py — Stage 1 safety screening for CSV files.

Checks: file size, row/column limits, binary content detection, encoding sniff,
        formula-injection cell prefix detection (=, +, -, @).

Note: Most origin signals are NOT assessable for CSV (no file metadata).
      This is reported honestly in the origin check result.
      No text is parsed beyond sniffing headers and row/column structure.
"""
import io
from pathlib import Path
from app.services.screening.common import ScreeningResult, with_timeout

_CSV_SCREEN_TIMEOUT_S = 30

# Formula injection prefixes (OWASP CSV injection)
FORMULA_PREFIXES = ("=", "+", "-", "@", "\t=", "\r=")


def screen_csv(path: Path, max_rows: int, max_cols: int) -> ScreeningResult:
    try:
        return with_timeout(
            _CSV_SCREEN_TIMEOUT_S,
            _screen_csv_inner,
            path, max_rows, max_cols,
        )
    except Exception as exc:
        return ScreeningResult(
            passed=False,
            reason=f"CSV safety check could not be completed: {type(exc).__name__}.",
            file_format="csv",
            details={"error": str(exc)[:200]},
        )


def _screen_csv_inner(path: Path, max_rows: int, max_cols: int) -> ScreeningResult:
    details: dict = {}

    # Binary content check: sample first 8 KB
    with open(path, "rb") as fh:
        sample = fh.read(8192)

    # Detect binary content (high proportion of non-text bytes)
    non_text = sum(1 for b in sample if b < 9 or (13 < b < 32))
    binary_ratio = non_text / max(len(sample), 1)
    details["binary_ratio"] = round(binary_ratio, 4)
    if binary_ratio > 0.1:
        return ScreeningResult(
            passed=False,
            reason="CSV file appears to contain binary data. Only plain text CSV files are accepted.",
            file_format="csv",
            details=details,
        )

    # Encoding detection
    encoding = "utf-8"
    try:
        from charset_normalizer import from_bytes
        result = from_bytes(sample)
        best = result.best()
        if best:
            encoding = str(best.encoding)
    except ImportError:
        # Fall back to utf-8 with errors=ignore
        pass
    details["detected_encoding"] = encoding

    # Row/column scan (memory-efficient)
    import csv
    row_count = 0
    max_col_count = 0
    formula_cells: list[str] = []

    try:
        with open(path, "r", encoding=encoding, errors="ignore", newline="") as fh:
            # Restrict delimiter detection to common CSV separators. The
            # unrestricted Sniffer can select a character from a formula
            # argument (for example, the "n" in HYPERLINK) as the delimiter.
            try:
                dialect = csv.Sniffer().sniff(fh.read(4096), delimiters=",;\t|")
                fh.seek(0)
            except csv.Error:
                fh.seek(0)
                dialect = csv.excel

            reader = csv.reader(fh, dialect)
            for row in reader:
                row_count += 1
                if row_count > max_rows:
                    return ScreeningResult(
                        passed=False,
                        reason=f"CSV exceeds the maximum row limit ({max_rows} rows).",
                        file_format="csv",
                        details=details,
                    )
                col_count = len(row)
                if col_count > max_cols:
                    return ScreeningResult(
                        passed=False,
                        reason=f"CSV has {col_count} columns in row {row_count}; maximum is {max_cols}.",
                        file_format="csv",
                        details=details,
                    )
                max_col_count = max(max_col_count, col_count)

                # Formula injection check (header row included)
                for cell in row:
                    stripped = cell.strip()
                    if stripped and stripped[0] in "=+-@":
                        formula_cells.append(stripped[:50])
                        if len(formula_cells) >= 20:
                            break
    except Exception as exc:
        return ScreeningResult(
            passed=False,
            reason=f"CSV could not be parsed: {str(exc)[:150]}.",
            file_format="csv",
            details=details,
        )

    details["row_count"] = row_count
    details["max_col_count"] = max_col_count
    details["formula_injection_cells"] = formula_cells[:10]  # truncate for storage
    details["formula_injection_count"] = len(formula_cells)
    # Formula injection is flagged but NOT a hard rejection (cells are sanitised on export)
    details["has_formula_injection"] = len(formula_cells) > 0

    return ScreeningResult(passed=True, reason="", file_format="csv", details=details)
