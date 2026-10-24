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
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 12  # 12 hours
    
    # Uploads
    UPLOAD_DIR: Path = BASE_DIR / "uploads"
    MAX_UPLOAD_SIZE_MB: int = 15
    ALLOWED_EXTENSIONS: set = {".pdf", ".csv", ".xlsx", ".png", ".jpg", ".jpeg"}
    
    # CORS
    CORS_ORIGINS: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "*",
    ]
    
    # AICTE Rule Defaults (APH 2024-27 + 2026-27 Addendum)
    DEFAULT_BASE_DEPOSIT: float = 3500000.0  # ₹35 Lakh standard base
    CONCESSION_MULTIPLIER: float = 0.5       # 50% for NE, J&K, Ladakh, Aspirational, Women, PwD
    LEASED_LAND_MULTIPLIER: float = 2.0     # Double for leased land
    GRACE_DAYS: int = 15                     # 15 days from intimation
    PENALTY_TIER_1_PCT: float = 10.0         # 10% penalty up to 31 May
    PENALTY_TIER_2_PCT: float = 20.0         # 20% penalty up to 31 July
    STATEMENT_MATCH_WINDOW_DAYS: int = 15    # ±15 days for matching candidate statement lines
    REMINDER_DAYS: list[int] = [90, 60, 30, 15, 7]

    class Config:
        case_sensitive = True

settings = Settings()
settings.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
