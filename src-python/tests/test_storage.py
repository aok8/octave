"""
Tests for POST /storage/export and POST /storage/import endpoints.

Acceptance criteria:
  - POST /storage/export happy path: shutil.copy2 called, 200 returned
  - POST /storage/export database not found → 404
  - POST /storage/import mode="replace" happy path: shutil.copy2 called, 200 returned
  - POST /storage/import mode="merge" happy path: shutil.copy2 called, 200 returned
  - POST /storage/import invalid mode → 400
  - POST /storage/import source file not found → 404
  - POST /auth/logout → 200, {"status": "ok"}
"""

import sys
import os

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient


# ---------------------------------------------------------------------------
# Tests — POST /storage/export
# ---------------------------------------------------------------------------


def test_export_db_success(client: TestClient, tmp_db: str, mocker):
    """Happy path: DB exists, shutil.copy2 called, 200 returned."""
    mocker.patch("routers.storage.os.path.exists", return_value=True)
    mock_copy = mocker.patch("routers.storage.shutil.copy2")

    resp = client.post("/storage/export", json={"path": "backup.db"})

    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["status"] == "ok"
    assert data["exported_to"] == "backup.db"
    mock_copy.assert_called_once()


def test_export_db_not_found(client: TestClient, tmp_db: str, mocker):
    """DB file does not exist → 404."""
    mocker.patch("routers.storage.os.path.exists", return_value=False)

    resp = client.post("/storage/export", json={"path": "backup.db"})

    assert resp.status_code == 404, resp.text


# ---------------------------------------------------------------------------
# Tests — POST /storage/import
# ---------------------------------------------------------------------------


def test_import_db_replace_success(client: TestClient, tmp_db: str, mocker):
    """Happy path with mode='replace': shutil.copy2 called, 200 returned."""
    mocker.patch("routers.storage.os.path.exists", return_value=True)
    mock_copy = mocker.patch("routers.storage.shutil.copy2")

    resp = client.post("/storage/import", json={"path": "src.db", "mode": "replace"})

    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["status"] == "ok"
    assert data["mode"] == "replace"
    mock_copy.assert_called_once()


def test_import_db_merge_success(client: TestClient, tmp_db: str, mocker):
    """Happy path with mode='merge': shutil.copy2 called, 200 returned."""
    mocker.patch("routers.storage.os.path.exists", return_value=True)
    mock_copy = mocker.patch("routers.storage.shutil.copy2")

    resp = client.post("/storage/import", json={"path": "src.db", "mode": "merge"})

    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["status"] == "ok"
    assert data["mode"] == "merge"
    mock_copy.assert_called_once()


def test_import_db_invalid_mode(client: TestClient, tmp_db: str, mocker):
    """Unknown mode → 400."""
    mocker.patch("routers.storage.os.path.exists", return_value=True)
    mocker.patch("routers.storage.shutil.copy2")

    resp = client.post("/storage/import", json={"path": "src.db", "mode": "invalid"})

    assert resp.status_code == 400, resp.text


def test_import_db_not_found(client: TestClient, tmp_db: str, mocker):
    """Source file does not exist → 404."""
    mocker.patch("routers.storage.os.path.exists", return_value=False)

    resp = client.post("/storage/import", json={"path": "missing.db", "mode": "replace"})

    assert resp.status_code == 404, resp.text


# ---------------------------------------------------------------------------
# Tests — POST /auth/logout
# ---------------------------------------------------------------------------


def test_logout_ok(client: TestClient, tmp_db: str):
    """POST /auth/logout → 200, {"status": "ok"}."""
    resp = client.post("/auth/logout")

    assert resp.status_code == 200, resp.text
    assert resp.json() == {"status": "ok"}
