"""
Tests for the AI Playlist Generation API (Sprint 9).

Covers:
- Unit tests for ai.py functions (openrouter, ollama, resolve_tracks)
- Integration tests for POST /ai/generate, POST /ai/key, GET /ai/status

Mocking rules:
  * requests.post for OpenRouter/Ollama → mocker.patch("requests.post", ...)
  * sp.search() for track resolution → mocker.patch.object(spotipy.Spotify, "search", ...)
  * sp.current_user() / GET /me/ → mocker.patch.object(spotipy.Spotify, "current_user", ...)
  NEVER use @responses.activate for OpenRouter or Ollama calls.
"""

import json
import sqlite3
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
import requests
import spotipy
from fastapi.testclient import TestClient

# ---------------------------------------------------------------------------
# Constants / stubs
# ---------------------------------------------------------------------------

FAKE_TOKEN = "valid_test_token"

AI_SUGGESTIONS = [
    {"title": "Redbone", "artist": "Childish Gambino"},
    {"title": "HUMBLE.", "artist": "Kendrick Lamar"},
]

RESOLVED_TRACK_STUB = {
    "id": "track_001",
    "name": "Redbone",
    "artists": [{"id": "art1", "name": "Childish Gambino"}],
    "album": {
        "name": "Awaken, My Love!",
        "images": [{"url": "https://example.com/art.jpg"}],
    },
    "duration_ms": 326693,
}


def _make_openrouter_response(content: str):
    """Build a mock requests.Response for OpenRouter."""
    mock_resp = MagicMock()
    mock_resp.raise_for_status = MagicMock()
    mock_resp.json.return_value = {
        "choices": [{"message": {"content": content}}]
    }
    return mock_resp


def _make_ollama_response(content: str):
    """Build a mock requests.Response for Ollama."""
    mock_resp = MagicMock()
    mock_resp.raise_for_status = MagicMock()
    mock_resp.json.return_value = {"response": content}
    return mock_resp


def _make_search_result(track: dict):
    """Wrap a Spotify track dict in the search result envelope."""
    return {"tracks": {"items": [track]}}


def _make_empty_search_result():
    """Return a Spotify search result with no items."""
    return {"tracks": {"items": []}}


# ---------------------------------------------------------------------------
# Unit tests: generate_with_openrouter
# ---------------------------------------------------------------------------


def test_generate_with_openrouter_returns_track_list(mocker):
    """generate_with_openrouter() must return a list of title/artist dicts."""
    import ai

    mock_post = mocker.patch(
        "requests.post",
        return_value=_make_openrouter_response(json.dumps(AI_SUGGESTIONS)),
    )

    result = ai.generate_with_openrouter("chill vibes playlist", api_key="test-key")

    assert isinstance(result, list)
    assert len(result) == 2
    assert result[0]["title"] == "Redbone"
    assert result[0]["artist"] == "Childish Gambino"
    mock_post.assert_called_once()


def test_generate_with_openrouter_raises_on_bad_json(mocker):
    """generate_with_openrouter() must raise ValueError when content is not valid JSON."""
    import ai

    mocker.patch(
        "requests.post",
        return_value=_make_openrouter_response("This is not JSON at all!"),
    )

    with pytest.raises(ValueError):
        ai.generate_with_openrouter("upbeat workout", api_key="test-key")


def test_generate_with_openrouter_raises_on_non_list_json(mocker):
    """generate_with_openrouter() must raise ValueError when JSON is not a list."""
    import ai

    mocker.patch(
        "requests.post",
        return_value=_make_openrouter_response(json.dumps({"tracks": []})),
    )

    with pytest.raises(ValueError):
        ai.generate_with_openrouter("morning run", api_key="test-key")


# ---------------------------------------------------------------------------
# Unit tests: generate_with_ollama
# ---------------------------------------------------------------------------


def test_generate_with_ollama_returns_track_list(mocker):
    """generate_with_ollama() must return a list of title/artist dicts."""
    import ai

    mocker.patch(
        "requests.post",
        return_value=_make_ollama_response(json.dumps(AI_SUGGESTIONS)),
    )

    result = ai.generate_with_ollama("chill vibes")

    assert isinstance(result, list)
    assert result[1]["title"] == "HUMBLE."
    assert result[1]["artist"] == "Kendrick Lamar"


def test_generate_with_ollama_raises_on_connection_error(mocker):
    """generate_with_ollama() must raise ValueError when Ollama is unreachable."""
    import ai

    mocker.patch(
        "requests.post",
        side_effect=requests.exceptions.ConnectionError("refused"),
    )

    with pytest.raises(ValueError, match="Cannot reach local Ollama"):
        ai.generate_with_ollama("jazz evening")


def test_generate_with_ollama_raises_on_bad_json(mocker):
    """generate_with_ollama() must raise ValueError on non-JSON Ollama response."""
    import ai

    mocker.patch(
        "requests.post",
        return_value=_make_ollama_response("not a JSON array"),
    )

    with pytest.raises(ValueError):
        ai.generate_with_ollama("rainy day")


# ---------------------------------------------------------------------------
# Unit tests: resolve_tracks
# ---------------------------------------------------------------------------


def test_resolve_tracks_filters_empty_results(mocker):
    """resolve_tracks() must skip suggestions where Spotify returns no items."""
    import ai

    def mock_search(q, type, limit):  # noqa: A002
        if "Redbone" in q:
            return _make_search_result(RESOLVED_TRACK_STUB)
        return _make_empty_search_result()

    mocker.patch.object(spotipy.Spotify, "search", side_effect=mock_search)
    sp = spotipy.Spotify(auth="fake")

    suggestions = [
        {"title": "Redbone", "artist": "Childish Gambino"},
        {"title": "Nonexistent Song XYZ", "artist": "Unknown Artist"},
    ]

    result = ai.resolve_tracks(sp, suggestions)

    assert len(result) == 1
    assert result[0]["id"] == "track_001"


def test_resolve_tracks_maps_fields_correctly(mocker):
    """resolve_tracks() must produce dicts with id, name, artist_names, album_name, etc."""
    import ai

    mocker.patch.object(
        spotipy.Spotify,
        "search",
        return_value=_make_search_result(RESOLVED_TRACK_STUB),
    )
    sp = spotipy.Spotify(auth="fake")

    result = ai.resolve_tracks(sp, [{"title": "Redbone", "artist": "Childish Gambino"}])

    assert len(result) == 1
    track = result[0]
    assert track["id"] == "track_001"
    assert track["name"] == "Redbone"
    assert "Childish Gambino" in track["artist_names"]
    assert track["album_name"] == "Awaken, My Love!"
    assert track["album_art_url"] == "https://example.com/art.jpg"
    assert track["duration_ms"] == 326693


# ---------------------------------------------------------------------------
# Integration tests: POST /ai/generate
# ---------------------------------------------------------------------------


def test_ai_generate_with_openrouter_key_returns_tracks(client: TestClient, tmp_db: str, mocker):
    """POST /ai/generate with an API key must call OpenRouter and return tracks."""
    mocker.patch(
        "ai.generate_with_openrouter",
        return_value=AI_SUGGESTIONS,
    )
    mocker.patch(
        "ai.resolve_tracks",
        return_value=[
            {
                "id": "track_001",
                "name": "Redbone",
                "artist_names": ["Childish Gambino"],
                "album_name": "Awaken, My Love!",
                "album_art_url": "https://example.com/art.jpg",
                "duration_ms": 326693,
            }
        ],
    )

    resp = client.post(
        "/ai/generate",
        json={
            "access_token": FAKE_TOKEN,
            "prompt": "chill neo-soul vibes",
            "ai_key": "sk-test-key",
        },
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["provider"] == "openrouter"
    assert len(data["tracks"]) == 1
    assert data["tracks"][0]["id"] == "track_001"


def test_ai_generate_with_local_ollama(client: TestClient, tmp_db: str, mocker):
    """POST /ai/generate with empty ai_key must call Ollama and return tracks."""
    mocker.patch(
        "ai.generate_with_ollama",
        return_value=AI_SUGGESTIONS,
    )
    mocker.patch(
        "ai.resolve_tracks",
        return_value=[
            {
                "id": "track_002",
                "name": "HUMBLE.",
                "artist_names": ["Kendrick Lamar"],
                "album_name": "DAMN.",
                "album_art_url": None,
                "duration_ms": 177000,
            }
        ],
    )

    resp = client.post(
        "/ai/generate",
        json={
            "access_token": FAKE_TOKEN,
            "prompt": "pump up hip-hop",
            "ai_key": "",
        },
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["provider"] == "ollama"
    assert data["tracks"][0]["id"] == "track_002"


def test_ai_generate_prompt_too_long_returns_422(client: TestClient, tmp_db: str):
    """POST /ai/generate with a 501-char prompt must return 422."""
    long_prompt = "x" * 501
    resp = client.post(
        "/ai/generate",
        json={"access_token": FAKE_TOKEN, "prompt": long_prompt, "ai_key": ""},
    )
    assert resp.status_code == 422, resp.text


def test_ai_generate_empty_prompt_returns_422(client: TestClient, tmp_db: str):
    """POST /ai/generate with an empty prompt must return 422."""
    resp = client.post(
        "/ai/generate",
        json={"access_token": FAKE_TOKEN, "prompt": "", "ai_key": ""},
    )
    assert resp.status_code == 422, resp.text


def test_ai_generate_openrouter_fails_falls_back_to_ollama(
    client: TestClient, tmp_db: str, mocker
):
    """When OpenRouter raises, endpoint must fall back to Ollama successfully."""
    mocker.patch(
        "ai.generate_with_openrouter",
        side_effect=ValueError("OpenRouter quota exceeded"),
    )
    mocker.patch(
        "ai.generate_with_ollama",
        return_value=AI_SUGGESTIONS,
    )
    mocker.patch(
        "ai.resolve_tracks",
        return_value=[
            {
                "id": "track_001",
                "name": "Redbone",
                "artist_names": ["Childish Gambino"],
                "album_name": "Awaken, My Love!",
                "album_art_url": None,
                "duration_ms": 326693,
            }
        ],
    )

    resp = client.post(
        "/ai/generate",
        json={
            "access_token": FAKE_TOKEN,
            "prompt": "chill evening",
            "ai_key": "sk-test-key",
        },
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["provider"] == "ollama"


def test_ai_generate_both_fail_returns_503(client: TestClient, tmp_db: str, mocker):
    """When both OpenRouter and Ollama fail, endpoint must return 503."""
    mocker.patch(
        "ai.generate_with_openrouter",
        side_effect=ValueError("OpenRouter error"),
    )
    mocker.patch(
        "ai.generate_with_ollama",
        side_effect=ValueError("Ollama also down"),
    )

    resp = client.post(
        "/ai/generate",
        json={
            "access_token": FAKE_TOKEN,
            "prompt": "night drive music",
            "ai_key": "sk-test-key",
        },
    )
    assert resp.status_code == 503, resp.text


def test_ai_generate_logs_event(client: TestClient, tmp_db: str, mocker):
    """Successful AI generation must log an ai_playlist_generated event."""
    mocker.patch("ai.generate_with_openrouter", return_value=AI_SUGGESTIONS)
    mocker.patch(
        "ai.resolve_tracks",
        return_value=[
            {
                "id": "track_001",
                "name": "Redbone",
                "artist_names": ["Childish Gambino"],
                "album_name": "Awaken, My Love!",
                "album_art_url": None,
                "duration_ms": 326693,
            }
        ],
    )

    resp = client.post(
        "/ai/generate",
        json={
            "access_token": FAKE_TOKEN,
            "prompt": "study focus",
            "ai_key": "sk-test-key",
        },
    )
    assert resp.status_code == 200, resp.text

    conn = sqlite3.connect(tmp_db)
    row = conn.execute(
        "SELECT * FROM interaction_log WHERE event_type = 'ai_playlist_generated'"
    ).fetchone()
    conn.close()
    assert row is not None, "No ai_playlist_generated event found in interaction_log"


# ---------------------------------------------------------------------------
# Integration tests: POST /ai/key and GET /ai/status
# ---------------------------------------------------------------------------


def test_set_ai_key_stores_value(client: TestClient, tmp_db: str):
    """POST /ai/key must store the key in the ai_config table."""
    resp = client.post("/ai/key", json={"key": "sk-my-openrouter-key"})
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"status": "ok"}

    conn = sqlite3.connect(tmp_db)
    conn.row_factory = sqlite3.Row
    row = conn.execute(
        "SELECT value FROM ai_config WHERE key = 'openrouter_api_key'"
    ).fetchone()
    conn.close()

    assert row is not None, "Key not stored in ai_config"
    assert dict(row)["value"] == "sk-my-openrouter-key"


def test_get_ai_status_returns_configured(client: TestClient, tmp_db: str):
    """GET /ai/status must return 'configured' after storing a non-empty key."""
    client.post("/ai/key", json={"key": "sk-configured-key"})

    resp = client.get("/ai/status")
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "configured"


def test_get_ai_status_returns_null_when_unset(client: TestClient, tmp_db: str):
    """GET /ai/status must return null when no key has ever been set."""
    resp = client.get("/ai/status")
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] is None


def test_get_ai_status_returns_local_when_key_cleared(client: TestClient, tmp_db: str):
    """GET /ai/status must return 'local' when key is stored as empty string."""
    client.post("/ai/key", json={"key": ""})

    resp = client.get("/ai/status")
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "local"


def test_set_ai_key_overwrites_existing(client: TestClient, tmp_db: str):
    """POST /ai/key must overwrite any previously stored key."""
    client.post("/ai/key", json={"key": "sk-old-key"})
    client.post("/ai/key", json={"key": "sk-new-key"})

    conn = sqlite3.connect(tmp_db)
    conn.row_factory = sqlite3.Row
    row = conn.execute(
        "SELECT value FROM ai_config WHERE key = 'openrouter_api_key'"
    ).fetchone()
    conn.close()

    assert dict(row)["value"] == "sk-new-key"
