from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import declarative_base, sessionmaker
from app.config import settings

connect_args = {}
if settings.DATABASE_URL.startswith("sqlite"):
    connect_args["check_same_thread"] = False

engine = create_engine(
    settings.DATABASE_URL,
    connect_args=connect_args,
    echo=False,
    future=True
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def upgrade_sqlite_schema() -> None:
    """Add columns introduced after the initial SQLite demo database."""
    if not settings.DATABASE_URL.startswith("sqlite"):
        return

    inspector = inspect(engine)
    with engine.begin() as connection:
        if "documents" in inspector.get_table_names():
            existing_columns = {
                column["name"] for column in inspector.get_columns("documents")
            }
            additions = {
                "gate_state": "VARCHAR(50) NOT NULL DEFAULT 'quarantined'",
                "gate_reason": "TEXT",
                "file_format": "VARCHAR(20)",
                "quarantine_key": "VARCHAR(255)",
                "screened_at": "DATETIME",
                "cleared_at": "DATETIME",
                "screening_result": "JSON",
            }
            for name, definition in additions.items():
                if name not in existing_columns:
                    connection.execute(text(
                        f"ALTER TABLE documents ADD COLUMN {name} {definition}"
                    ))


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
