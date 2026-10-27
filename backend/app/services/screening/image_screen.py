"""
screening/image_screen.py — Stage 1 safety screening for image files.

Accepted: JPG/JPEG, PNG, WEBP
Checks: dimension limits, pixel count (decompression-bomb guard via Pillow),
        animated/multi-frame detection, EXIF presence metadata read.

Metadata is NOT stripped at this stage — it is evidence for Stage 2.
NO text extraction, NO OCR, NO LLM calls, NO external API calls.
"""
from pathlib import Path
from app.services.screening.common import ScreeningResult, with_timeout

_IMAGE_SCREEN_TIMEOUT_S = 15


def screen_image(path: Path, max_pixels: int, max_dim: int) -> ScreeningResult:
    try:
        return with_timeout(
            _IMAGE_SCREEN_TIMEOUT_S,
            _screen_image_inner,
            path, max_pixels, max_dim,
        )
    except Exception as exc:
        return ScreeningResult(
            passed=False,
            reason=f"Image safety check could not be completed: {type(exc).__name__}.",
            file_format=_ext_label(path),
            details={"error": str(exc)[:200]},
        )


def _ext_label(path: Path) -> str:
    return path.suffix.lower().lstrip(".")


def _screen_image_inner(path: Path, max_pixels: int, max_dim: int) -> ScreeningResult:
    details: dict = {}
    fmt = _ext_label(path)

    try:
        from PIL import Image
        # Set decompression bomb threshold to our pixel limit before opening
        Image.MAX_IMAGE_PIXELS = max_pixels
        img = Image.open(path)
    except ImportError:
        # Pillow not available — do basic size check only and pass
        details["pillow_unavailable"] = True
        return ScreeningResult(passed=True, reason="", file_format=fmt, details=details)
    except Exception as exc:
        err = str(exc)
        if "decompression bomb" in err.lower() or "image size" in err.lower():
            return ScreeningResult(
                passed=False,
                reason="Image exceeds the pixel limit and cannot be opened safely.",
                file_format=fmt,
                details={"decompression_bomb": True},
            )
        return ScreeningResult(
            passed=False,
            reason=f"Image could not be opened: {err[:150]}.",
            file_format=fmt,
            details={"open_error": err[:200]},
        )

    width, height = img.size
    details["width"] = width
    details["height"] = height
    pixels = width * height
    details["pixel_count"] = pixels

    if pixels > max_pixels:
        return ScreeningResult(
            passed=False,
            reason=f"Image has {pixels:,} pixels, which exceeds the limit of {max_pixels:,}.",
            file_format=fmt,
            details=details,
        )
    if width > max_dim or height > max_dim:
        return ScreeningResult(
            passed=False,
            reason=f"Image dimension ({width}×{height}) exceeds the maximum ({max_dim}px per side).",
            file_format=fmt,
            details=details,
        )

    # Multi-frame / animated detection
    try:
        n_frames = getattr(img, "n_frames", 1)
        details["n_frames"] = n_frames
        details["is_animated"] = n_frames > 1
    except Exception:
        details["n_frames"] = 1
        details["is_animated"] = False

    # EXIF metadata read (safe — do NOT strip; metadata is evidence for Stage 2)
    try:
        exif_data = img._getexif() if hasattr(img, "_getexif") else None
        details["has_exif"] = exif_data is not None and len(exif_data) > 0
        if exif_data:
            # Read software tag (EXIF tag 305) without loading all data
            software = exif_data.get(305, "")
            if software:
                details["exif_software"] = str(software)[:200]
    except Exception:
        details["has_exif"] = False

    # For PNG: check tEXt/zTXt chunks for software tag (outside EXIF)
    if fmt == "png":
        try:
            png_info = img.info or {}
            software = png_info.get("Software", png_info.get("software", ""))
            if software:
                details["png_software"] = str(software)[:200]
        except Exception:
            pass

    return ScreeningResult(passed=True, reason="", file_format=fmt, details=details)
