import os
from pathlib import Path
from pydantic_settings import BaseSettings

BASE_DIR = Path(__file__).resolve().parent.parent

class Settings(BaseSettings):
    PROJECT_NAME: str = "AICTE Security Deposit / FDR Management Portal API"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api"

    # Database
    DATABASE_URL: str = os.getenv("DATABASE_URL", f"sqlite:///{BASE_DIR / 'aicte_portal.db'}")

    # JWT Auth
    SECRET_KEY: str = os.getenv("SECRET_KEY", "aicte-portal-local-development-secret-key-2026")
    IDENTIFIER_HASH_SALT: str = os.getenv("IDENTIFIER_HASH_SALT", "local-development-identifier-salt")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 12  # 12 hours

    # Uploads (legacy dir preserved for existing records)
    UPLOAD_DIR: Path = BASE_DIR / "uploads"
    # Quarantine storage: isolated path outside web root; files stored with random names
    QUARANTINE_DIR: Path = BASE_DIR / "quarantine"

    # Upload limits and allowed types (extension AND magic-bytes checked)
    MAX_UPLOAD_MB: int = int(os.getenv("MAX_UPLOAD_MB", "15"))
    # Kept for back-compat
    MAX_UPLOAD_SIZE_MB: int = int(os.getenv("MAX_UPLOAD_MB", "15"))
    ALLOWED_EXTENSIONS: set = {".pdf", ".docx", ".xlsx", ".csv", ".png", ".jpg", ".jpeg", ".webp"}

    # Per-format safety limits
    PDF_MAX_PAGES: int = int(os.getenv("PDF_MAX_PAGES", "100"))
    DOCX_MAX_ENTRIES: int = int(os.getenv("DOCX_MAX_ENTRIES", "500"))
    DOCX_MAX_UNCOMPRESSED_MB: int = int(os.getenv("DOCX_MAX_UNCOMPRESSED_MB", "50"))
    DOCX_MAX_RATIO: float = float(os.getenv("DOCX_MAX_RATIO", "50.0"))
    XLSX_MAX_ENTRIES: int = int(os.getenv("XLSX_MAX_ENTRIES", "500"))
    XLSX_MAX_UNCOMPRESSED_MB: int = int(os.getenv("XLSX_MAX_UNCOMPRESSED_MB", "50"))
    XLSX_MAX_RATIO: float = float(os.getenv("XLSX_MAX_RATIO", "50.0"))
    CSV_MAX_ROWS: int = int(os.getenv("CSV_MAX_ROWS", "50000"))
    CSV_MAX_COLS: int = int(os.getenv("CSV_MAX_COLS", "100"))
    IMG_MAX_PIXELS: int = int(os.getenv("IMG_MAX_PIXELS", "89478485"))  # ~89 MP
    IMG_MAX_DIM: int = int(os.getenv("IMG_MAX_DIM", "20000"))

    # CORS
    CORS_ORIGINS: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "*",
    ]

    # ── Gate policy (versioned, admin-editable, audited) ──────────────────────
    # Result labels that trigger auto-clear (comma-separated)
    GATE_AUTO_CLEAR_RESULTS: str = os.getenv("GATE_AUTO_CLEAR_RESULTS", "no_indicators_found")
    # Policy for formats where origin check is not assessable (e.g. CSV)
    # Allowed values: hold | clear_with_note
    GATE_NOT_ASSESSABLE_POLICY: str = os.getenv("GATE_NOT_ASSESSABLE_POLICY", "hold")
    # Result labels that trigger hold (comma-separated)
    GATE_HOLD_RESULTS: str = os.getenv("GATE_HOLD_RESULTS", "inconclusive,indicators_present")
    # How many times to auto-retry a check_failed result (0 = never)
    GATE_RETRY_ON_CHECK_FAILED: int = int(os.getenv("GATE_RETRY_ON_CHECK_FAILED", "1"))
    # Gate policy version string (bumped when admin changes policy)
    GATE_POLICY_VERSION: str = os.getenv("GATE_POLICY_VERSION", "1.0.0")

    # ── External provider flags ───────────────────────────────────────────────
    # When true, no real documents are sent to external APIs; only synthetic test
    # documents may be submitted (label visible in UI).
    USE_SYNTHETIC_ONLY: bool = os.getenv("USE_SYNTHETIC_ONLY", "true").lower() == "true"
    # Text detector: none | sapling | ... (disabled by default; can only run
    # AFTER gate clearance, never before text extraction)
    TEXT_DETECTOR: str = os.getenv("TEXT_DETECTOR", "none")

    # AICTE Rule Defaults (APH 2024-27 + 2026-27 Addendum)
    DEFAULT_BASE_DEPOSIT: float = 3500000.0  # ₹35 Lakh standard base
    CONCESSION_MULTIPLIER: float = 0.5       # 50% for NE, J&K, Ladakh, Aspirational, Women, PwD
    LEASED_LAND_MULTIPLIER: float = 2.0      # Double for leased land
    GRACE_DAYS: int = 15                     # 15 days from intimation
    PENALTY_TIER_1_PCT: float = 10.0         # 10% penalty up to 31 May
    PENALTY_TIER_2_PCT: float = 20.0         # 20% penalty up to 31 July
    STATEMENT_MATCH_WINDOW_DAYS: int = 15    # ±15 days for matching candidate statement lines
    REMINDER_DAYS: list[int] = [90, 60, 30, 15, 7]

    # Known AI-generator marker strings (checked in metadata; add to config, not hardcoded)
    AI_GENERATOR_MARKERS: list[str] = [
        "DALL-E", "Midjourney", "Stable Diffusion", "StableDiffusion",
        "firefly", "Adobe Firefly", "Bing Image Creator", "FLUX",
        "ImageFX", "Ideogram", "Leonardo.AI",
        "ChatGPT", "GPT-4", "Claude Sonnet", "Gemini",
    ]

    class Config:
        case_sensitive = True


settings = Settings()
settings.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
settings.QUARANTINE_DIR.mkdir(parents=True, exist_ok=True)
