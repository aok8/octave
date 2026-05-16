"""
Tests for /settings endpoints in routers/settings_api.py.

Uses client: TestClient and tmp_db: str fixtures from conftest.py.
"""

import pytest
from fastapi.testclient import TestClient

import rapidapi_client


# ---------------------------------------------------------------------------
# RapidAPI key status tests
# ---------------------------------------------------------------------------


def test_rapidapi_key_status_unconfigured(client: TestClient, tmp_db: str):
    """GET /settings/rapidapi-key/status returns configured=false when no key stored."""
    response = client.get("/settings/rapidapi-key/status")
    assert response.status_code == 200
    data = response.json()
    assert data["configured"] is False
    assert data["source"] == "synthetic"


def test_rapidapi_key_save_and_status(client: TestClient, tmp_db: str):
    """POST a key, then GET status should return configured=true."""
    save_response = client.post(
        "/settings/rapidapi-key",
        json={"key": "my_test_rapidapi_key_12345"},
    )
    assert save_response.status_code == 200
    assert save_response.json()["ok"] is True

    status_response = client.get("/settings/rapidapi-key/status")
    assert status_response.status_code == 200
    data = status_response.json()
    assert data["configured"] is True
    assert data["source"] == "rapidapi"


def test_rapidapi_key_delete(client: TestClient, tmp_db: str):
    """POST save key → DELETE → GET status should return configured=false."""
    # Save
    client.post(
        "/settings/rapidapi-key",
        json={"key": "key_to_delete"},
    )

    # Verify it's saved
    status = client.get("/settings/rapidapi-key/status").json()
    assert status["configured"] is True

    # Delete
    delete_response = client.delete("/settings/rapidapi-key")
    assert delete_response.status_code == 200
    assert delete_response.json()["ok"] is True

    # Verify it's gone
    status_after = client.get("/settings/rapidapi-key/status").json()
    assert status_after["configured"] is False
    assert status_after["source"] == "synthetic"


def test_rapidapi_key_save_validates_empty(client: TestClient, tmp_db: str):
    """POST with empty key string should return 422 Unprocessable Entity."""
    response = client.post(
        "/settings/rapidapi-key",
        json={"key": ""},
    )
    assert response.status_code == 422


def test_rapidapi_key_save_validates_whitespace_only(client: TestClient, tmp_db: str):
    """POST with whitespace-only key string should return 422 Unprocessable Entity."""
    response = client.post(
        "/settings/rapidapi-key",
        json={"key": "   "},
    )
    assert response.status_code == 422


# ---------------------------------------------------------------------------
# Test-RapidAPI endpoint tests
# ---------------------------------------------------------------------------


def test_rapidapi_test_endpoint_success(client: TestClient, tmp_db: str, mocker):
    """POST /settings/test-rapidapi with mocked httpx → ok=true."""
    fake_response = mocker.MagicMock()
    fake_response.status_code = 200
    fake_response.json.return_value = {
        "energy": 70,
        "happiness": 50,
        "danceability": 65,
        "acousticness": 15,
        "instrumentalness": 5,
        "speechiness": 4,
        "tempo": 115.0,
        "loudness": -6.5,
        "key": "E minor",
        "time_signature": 4,
    }
    mocker.patch("rapidapi_client.httpx.get", return_value=fake_response)

    response = client.post(
        "/settings/test-rapidapi",
        json={"key": "test_key_abc"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["ok"] is True
    assert data["error"] is None


def test_rapidapi_test_endpoint_failure(client: TestClient, tmp_db: str, mocker):
    """POST /settings/test-rapidapi when httpx raises → ok=false, error non-null."""
    import httpx as httpx_lib

    mocker.patch(
        "rapidapi_client.httpx.get",
        side_effect=httpx_lib.ConnectError("Connection refused"),
    )

    response = client.post(
        "/settings/test-rapidapi",
        json={"key": "bad_key"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["ok"] is False
    assert data["error"] is not None
    assert len(data["error"]) > 0


def test_rapidapi_test_endpoint_404(client: TestClient, tmp_db: str, mocker):
    """POST /settings/test-rapidapi when API returns 404 → ok=false."""
    fake_response = mocker.MagicMock()
    fake_response.status_code = 404

    mocker.patch("rapidapi_client.httpx.get", return_value=fake_response)

    response = client.post(
        "/settings/test-rapidapi",
        json={"key": "invalid_key"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["ok"] is False
