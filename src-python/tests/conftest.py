import pytest
import sqlite3
import tempfile
import os

from fastapi.testclient import TestClient


@pytest.fixture
def tmp_db(tmp_path):
    """Create a temporary SQLite DB with the Octave schema for testing."""
    db_path = tmp_path / "test_octave.db"
    conn = sqlite3.connect(str(db_path))
    migrations_dir = os.path.join(
        os.path.dirname(__file__), "..", "..", "src-tauri", "migrations"
    )
    for migration_file in sorted(os.listdir(migrations_dir)):
        if migration_file.endswith(".sql"):
            migration_path = os.path.join(migrations_dir, migration_file)
            with open(migration_path) as f:
                conn.executescript(f.read())
    conn.commit()
    conn.close()
    os.environ["OCTAVE_DB_PATH"] = str(db_path)
    yield str(db_path)
    del os.environ["OCTAVE_DB_PATH"]


@pytest.fixture
def client(tmp_db):
    import sys

    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from main import app

    return TestClient(app)
