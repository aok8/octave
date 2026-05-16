"""
Tests for rapidapi_client.py — SoundNet Track Analysis API client.

Unit tests only — no HTTP calls, no DB, no TestClient needed.
"""

import pytest
import httpx

import rapidapi_client
from rapidapi_client import (
    _normalize_key,
    _normalize_response,
    get_features_batch,
)


# ---------------------------------------------------------------------------
# _normalize_key tests
# ---------------------------------------------------------------------------


def test_normalize_key_major():
    """'C major' should return pitch class 0, mode 1 (major)."""
    pitch, mode = _normalize_key("C major")
    assert pitch == 0
    assert mode == 1


def test_normalize_key_minor():
    """'F# minor' should return pitch class 6, mode 0 (minor)."""
    pitch, mode = _normalize_key("F# minor")
    assert pitch == 6
    assert mode == 0


def test_normalize_key_sharp():
    """'C#' with no mode given should return pitch class 1, mode None."""
    pitch, mode = _normalize_key("C#")
    assert pitch == 1
    assert mode is None


def test_normalize_key_empty():
    """Empty string should return (None, None)."""
    pitch, mode = _normalize_key("")
    assert pitch is None
    assert mode is None


def test_normalize_key_none():
    """None input should return (None, None)."""
    pitch, mode = _normalize_key(None)
    assert pitch is None
    assert mode is None


# ---------------------------------------------------------------------------
# _normalize_response tests
# ---------------------------------------------------------------------------


def test_normalize_response_scales():
    """energy=80 → 0.8, happiness=60 → valence=0.6."""
    raw = {
        "energy": 80,
        "happiness": 60,
        "danceability": 70,
        "acousticness": 20,
        "instrumentalness": 10,
        "speechiness": 5,
        "liveness": 15,
        "tempo": 128.0,
        "loudness": -6.0,
        "key": "C major",
        "time_signature": 4,
    }
    result = _normalize_response("track123", raw)

    assert result["track_id"] == "track123"
    assert abs(result["energy"] - 0.8) < 1e-9
    assert abs(result["valence"] - 0.6) < 1e-9
    assert abs(result["danceability"] - 0.7) < 1e-9
    assert result["tempo"] == 128.0
    assert result["loudness"] == -6.0


def test_normalize_response_key():
    """key='A minor' → key=9, mode=0."""
    raw = {
        "energy": 50,
        "happiness": 50,
        "danceability": 50,
        "acousticness": 50,
        "instrumentalness": 0,
        "speechiness": 5,
        "tempo": 120.0,
        "loudness": -8.0,
        "key": "A minor",
    }
    result = _normalize_response("track_a_minor", raw)
    assert result["key"] == 9
    assert result["mode"] == 0


def test_normalize_response_missing_fields():
    """Missing fields in raw response should produce None values (not KeyError)."""
    raw = {}
    result = _normalize_response("track_empty", raw)
    assert result["track_id"] == "track_empty"
    assert result["energy"] is None
    assert result["valence"] is None
    assert result["key"] is None
    assert result["mode"] is None


# ---------------------------------------------------------------------------
# get_features_batch tests
# ---------------------------------------------------------------------------


def test_get_features_batch_success(mocker):
    """Mock httpx.get returning 200 with valid data; assert normalized result returned."""
    fake_response = mocker.MagicMock()
    fake_response.status_code = 200
    fake_response.json.return_value = {
        "energy": 75,
        "happiness": 55,
        "danceability": 80,
        "acousticness": 10,
        "instrumentalness": 2,
        "speechiness": 3,
        "tempo": 120.0,
        "loudness": -5.0,
        "key": "G major",
        "time_signature": 4,
    }
    mocker.patch("rapidapi_client.httpx.get", return_value=fake_response)

    results = get_features_batch(["track_abc"], "fake_api_key")

    assert len(results) == 1
    assert results[0]["track_id"] == "track_abc"
    assert abs(results[0]["energy"] - 0.75) < 1e-9
    assert abs(results[0]["valence"] - 0.55) < 1e-9
    assert results[0]["key"] == 7  # G = 7
    assert results[0]["mode"] == 1  # major


def test_get_features_batch_404(mocker):
    """Mock httpx.get returning 404; assert empty list (best-effort, no crash)."""
    fake_response = mocker.MagicMock()
    fake_response.status_code = 404

    mocker.patch("rapidapi_client.httpx.get", return_value=fake_response)

    results = get_features_batch(["missing_track"], "fake_api_key")
    assert results == []


def test_get_features_batch_error(mocker):
    """Mock httpx.get raising an exception; assert empty list (best-effort, no crash)."""
    mocker.patch(
        "rapidapi_client.httpx.get",
        side_effect=httpx.ConnectError("Connection refused"),
    )

    results = get_features_batch(["error_track"], "fake_api_key")
    assert results == []


def test_get_features_batch_multiple_tracks(mocker):
    """Multiple tracks: one succeeds, one returns 404. Only successful track in results."""
    call_count = 0

    def fake_get(url, **kwargs):
        nonlocal call_count
        track_id = kwargs.get("params", {}).get("spotify_id", "")
        resp = mocker.MagicMock()
        if track_id == "good_track":
            resp.status_code = 200
            resp.json.return_value = {
                "energy": 60,
                "happiness": 40,
                "danceability": 70,
                "acousticness": 20,
                "instrumentalness": 5,
                "speechiness": 3,
                "tempo": 100.0,
                "loudness": -7.0,
                "key": "D minor",
            }
        else:
            resp.status_code = 404
        call_count += 1
        return resp

    mocker.patch("rapidapi_client.httpx.get", side_effect=fake_get)

    results = get_features_batch(["good_track", "bad_track"], "fake_api_key")
    assert len(results) == 1
    assert results[0]["track_id"] == "good_track"
    assert call_count == 2  # both tracks were attempted


def test_get_features_batch_empty_ids(mocker):
    """Empty track_ids list returns empty list without making any HTTP calls."""
    mock_get = mocker.patch("rapidapi_client.httpx.get")

    results = get_features_batch([], "fake_api_key")
    assert results == []
    mock_get.assert_not_called()
