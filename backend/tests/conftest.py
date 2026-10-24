import os
import pytest

os.environ.setdefault("SECRET_KEY", "test-only-secret-key-not-for-production")

from app.database import Base, engine, SessionLocal
from app.seed_data import seed_database

@pytest.fixture(scope="session", autouse=True)
def setup_test_database():
    # Drop all and recreate to have a clean, reproducible state for each test run
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    seed_database(db)
    db.close()
    yield
