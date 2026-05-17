import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient
from main import app

# Module-level client — no DB configured (OCTAVE_DB_PATH not set).
_bare_client = TestClient(app)


def test_health_no_db():
    """Health endpoint returns 200/ok even when no DB is configured."""
    response = _bare_client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["version"] == "2.0.0"
    # db_schema / db_path should be absent when OCTAVE_DB_PATH is not set
    assert "db_schema" not in body
    assert "db_error" not in body


def test_health_with_db(client, tmp_db):
    """Health endpoint includes db_schema when DB is configured."""
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert "db_schema" in body
    schema = body["db_schema"]
    # migration 001 tables
    assert "tracks" in schema
    assert "playlists" in schema
    # migration 004 columns must be present
    assert "artist_ids" in schema["tracks"], (
        "migration 004 not applied — artist_ids column missing from tracks"
    )
    assert "genres" in schema["tracks"], (
        "migration 004 not applied — genres column missing from tracks"
    )
