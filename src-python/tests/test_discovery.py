"""
Tests for the Discovery Mode API (Sprint 8 / Sprint 10).

Covers:
- Unit tests for the centroid algorithm (update_centroid)
- Integration tests for POST /discovery/start, /feedback, /end
- Mocking rules:
  * sp.track()            → mocker.patch.object(spotipy.Spotify, 'track', ...)
  * sp.search()           → mocker.patch.object(spotipy.Spotify, 'search', ...)
  * sp.audio_features()   → mocker.patch.object(spotipy.Spotify, 'audio_features', ...)
  * sp.current_user()     → mocker.patch.object(spotipy.Spotify, 'current_user', ...)
  NEVER use @responses.activate for track/search/audio_features/recommendations.
"""

import json
import sqlite3

import pytest
import responses as responses_lib
import spotipy
from fastapi.testclient import TestClient

# ---------------------------------------------------------------------------
# Constants / stubs
# ---------------------------------------------------------------------------

FAKE_TOKEN = "valid_test_token"
SEED_TRACK_ID = "seed_track_001"
KEPT_TRACK_ID = "kept_track_001"

ME_STUB = {
    "id": "user1",
    "display_name": "Discovery Tester",
    "email": "disc@example.com",
    "images": [],
}

AUDIO_FEATURES_STUB = {
    "id": SEED_TRACK_ID,
    "energy": 0.8,
    "valence": 0.7,
    "danceability": 0.6,
    "tempo": 130.0,
    "acousticness": 0.1,
    "instrumentalness": 0.0,
    "speechiness": 0.05,
    "loudness": -5.0,
    "key": 5,
    "mode": 1,
    "time_signature": 4,
}

KEPT_FEATURES_STUB = {
    "id": KEPT_TRACK_ID,
    "energy": 1.0,
    "valence": 0.9,
    "danceability": 0.8,
    "tempo": 140.0,
    "acousticness": 0.05,
    "instrumentalness": 0.0,
    "speechiness": 0.04,
    "loudness": -4.0,
    "key": 5,
    "mode": 1,
    "time_signature": 4,
}

SEED_TRACK_STUB = {
    "id": SEED_TRACK_ID,
    "name": "Seed Song",
    "artists": [{"id": "art1", "name": "Artist One"}],
    "album": {"name": "Seed Album", "images": []},
    "duration_ms": 200000,
    "popularity": 70,
}

SEARCH_RESULTS_STUB = {
    "tracks": {
        "items": [
            {
                "id": "rec_track_001",
                "name": "Recommended Song 1",
                "artists": [{"id": "art1", "name": "Artist One"}],
                "album": {
                    "name": "Rec Album",
                    "images": [{"url": "https://example.com/img.jpg"}],
                },
                "duration_ms": 210000,
                "popularity": 70,
            },
            {
                "id": "rec_track_002",
                "name": "Recommended Song 2",
                "artists": [{"id": "art1", "name": "Artist One"}],
                "album": {
                    "name": "Rec Album 2",
                    "images": [],
                },
                "duration_ms": 195000,
                "popularity": 65,
            },
        ],
        "total": 2,
        "next": None,
    }
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _seed_user(tmp_db: str, user_id: str = "user1") -> None:
    """Insert a user row so FK constraints are satisfied."""
    conn = sqlite3.connect(tmp_db)
    conn.execute(
        "INSERT OR IGNORE INTO users (id, display_name) VALUES (?, ?)",
        (user_id, "Test"),
    )
    conn.commit()
    conn.close()


def _mock_me(mocker):
    """Patch sp.current_user() to return ME_STUB."""
    mocker.patch.object(spotipy.Spotify, "current_user", return_value=ME_STUB)


def _mock_audio_features(mocker, stub=None):
    """Patch sp.audio_features() to return the given stub (wrapped in a list)."""
    if stub is None:
        stub = AUDIO_FEATURES_STUB
    mocker.patch.object(
        spotipy.Spotify,
        "audio_features",
        return_value=[stub],
    )


def _mock_search_discovery(mocker, seed_stub=None, search_stub=None):
    """Patch sp.track(), sp.search(), and find_similar_tracks for discovery flow.

    Patches ``discovery.find_similar_tracks`` to return [] so the artist-search
    fallback path is always exercised in these integration tests.
    """
    if seed_stub is None:
        seed_stub = SEED_TRACK_STUB
    if search_stub is None:
        search_stub = SEARCH_RESULTS_STUB
    mocker.patch.object(spotipy.Spotify, "track", return_value=seed_stub)
    mocker.patch.object(spotipy.Spotify, "search", return_value=search_stub)
    mocker.patch("similarity.find_similar_tracks", return_value=[])


# ---------------------------------------------------------------------------
# Unit tests: centroid algorithm
# ---------------------------------------------------------------------------


def test_discovery_update_centroid_moves_toward_liked():
    """update_centroid() must move centroid toward liked_features (EMA, alpha=0.3)."""
    from discovery import update_centroid

    centroid = {"energy": 0.5, "valence": 0.5, "danceability": 0.5, "tempo": 120.0, "acousticness": 0.3}
    liked = {"energy": 1.0, "valence": 0.9, "danceability": 0.8, "tempo": 140.0, "acousticness": 0.1}
    result = update_centroid(centroid, liked, alpha=0.3)

    # All values must move toward liked values
    assert result["energy"] > 0.5, f"energy should increase: {result['energy']}"
    assert result["valence"] > 0.5, f"valence should increase: {result['valence']}"
    assert result["danceability"] > 0.5, f"danceability should increase: {result['danceability']}"
    assert result["tempo"] > 120.0, f"tempo should increase: {result['tempo']}"
    assert result["acousticness"] < 0.3, f"acousticness should decrease: {result['acousticness']}"

    # Verify EMA formula: new = 0.7*old + 0.3*liked
    expected_energy = 0.7 * 0.5 + 0.3 * 1.0
    assert abs(result["energy"] - expected_energy) < 1e-9


def test_discovery_update_centroid_unchanged_on_skip():
    """Skipping a track must not call update_centroid — centroid remains unchanged."""
    from discovery import update_centroid

    centroid = {"energy": 0.5, "valence": 0.5, "danceability": 0.5, "tempo": 120.0, "acousticness": 0.3}
    # Simulating skip: we do NOT call update_centroid, so centroid is unchanged.
    # This test verifies update_centroid itself doesn't mutate the input.
    result = update_centroid(centroid, {})  # empty liked_features — nothing changes
    assert result["energy"] == centroid["energy"]
    assert result["valence"] == centroid["valence"]
    assert result["danceability"] == centroid["danceability"]
    assert result["tempo"] == centroid["tempo"]
    assert result["acousticness"] == centroid["acousticness"]


# ---------------------------------------------------------------------------
# Integration tests: POST /discovery/start
# ---------------------------------------------------------------------------


def test_discovery_start_returns_session_id(client: TestClient, tmp_db: str, mocker):
    """POST /discovery/start must return a non-empty session_id."""
    _seed_user(tmp_db)
    _mock_me(mocker)
    _mock_audio_features(mocker)
    _mock_search_discovery(mocker)

    resp = client.post(
        "/discovery/start",
        json={"access_token": FAKE_TOKEN, "seed_track_id": SEED_TRACK_ID},
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert "session_id" in data
    assert data["session_id"]  # non-empty


def test_discovery_start_creates_db_row(client: TestClient, tmp_db: str, mocker):
    """POST /discovery/start must insert a row into discovery_sessions."""
    _seed_user(tmp_db)
    _mock_me(mocker)
    _mock_audio_features(mocker)
    _mock_search_discovery(mocker)

    resp = client.post(
        "/discovery/start",
        json={"access_token": FAKE_TOKEN, "seed_track_id": SEED_TRACK_ID},
    )
    assert resp.status_code == 200, resp.text
    session_id = resp.json()["session_id"]

    conn = sqlite3.connect(tmp_db)
    row = conn.execute(
        "SELECT * FROM discovery_sessions WHERE id = ?", (session_id,)
    ).fetchone()
    conn.close()

    assert row is not None, "No discovery_sessions row found after /start"
    # Use column names via dict-style access (sqlite3.Row behaves like a tuple by default,
    # so query with column names explicitly)
    conn2 = sqlite3.connect(tmp_db)
    conn2.row_factory = sqlite3.Row
    row2 = conn2.execute(
        "SELECT * FROM discovery_sessions WHERE id = ?", (session_id,)
    ).fetchone()
    conn2.close()
    assert dict(row2)["seed_track_id"] == SEED_TRACK_ID


def test_discovery_start_calls_search(client: TestClient, tmp_db: str, mocker):
    """POST /discovery/start must call sp.search() to find tracks by the seed artist."""
    _seed_user(tmp_db)
    _mock_me(mocker)
    _mock_audio_features(mocker)
    _mock_search_discovery(mocker)

    resp = client.post(
        "/discovery/start",
        json={"access_token": FAKE_TOKEN, "seed_track_id": SEED_TRACK_ID},
    )
    assert resp.status_code == 200, resp.text
    assert spotipy.Spotify.search.called  # type: ignore[attr-defined]


def test_discovery_start_logs_event(client: TestClient, tmp_db: str, mocker):
    """POST /discovery/start must log a discovery_started event in interaction_log."""
    _seed_user(tmp_db)
    _mock_me(mocker)
    _mock_audio_features(mocker)
    _mock_search_discovery(mocker)

    resp = client.post(
        "/discovery/start",
        json={"access_token": FAKE_TOKEN, "seed_track_id": SEED_TRACK_ID},
    )
    assert resp.status_code == 200, resp.text

    conn = sqlite3.connect(tmp_db)
    row = conn.execute(
        "SELECT * FROM interaction_log WHERE event_type = 'discovery_started'"
    ).fetchone()
    conn.close()

    assert row is not None, "No discovery_started event in interaction_log"


def test_discovery_start_missing_token_returns_400(client: TestClient, tmp_db: str):
    """POST /discovery/start with empty access_token must return 400 or 422."""
    resp = client.post(
        "/discovery/start",
        json={"access_token": "", "seed_track_id": SEED_TRACK_ID},
    )
    assert resp.status_code in (400, 422), f"Expected 400 or 422, got {resp.status_code}"


# ---------------------------------------------------------------------------
# Integration tests: POST /discovery/feedback
# ---------------------------------------------------------------------------


def _start_session(client: TestClient, tmp_db: str, mocker) -> str:
    """Helper: start a session and return its session_id."""
    _seed_user(tmp_db)
    _mock_me(mocker)
    _mock_audio_features(mocker)
    _mock_search_discovery(mocker)
    resp = client.post(
        "/discovery/start",
        json={"access_token": FAKE_TOKEN, "seed_track_id": SEED_TRACK_ID},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["session_id"]


def test_discovery_feedback_keep_updates_centroid(client: TestClient, tmp_db: str, mocker):
    """POST /discovery/feedback with action=keep must update the centroid in the DB."""
    session_id = _start_session(client, tmp_db, mocker)

    # Read initial centroid
    conn = sqlite3.connect(tmp_db)
    before_row = conn.execute(
        "SELECT centroid FROM discovery_sessions WHERE id = ?", (session_id,)
    ).fetchone()
    conn.close()
    centroid_before = json.loads(before_row[0])

    # Re-mock for the feedback call
    _mock_me(mocker)
    mocker.patch.object(
        spotipy.Spotify,
        "audio_features",
        return_value=[KEPT_FEATURES_STUB],
    )
    _mock_search_discovery(mocker)

    resp = client.post(
        "/discovery/feedback",
        json={
            "access_token": FAKE_TOKEN,
            "session_id": session_id,
            "track_id": KEPT_TRACK_ID,
            "action": "keep",
        },
    )
    assert resp.status_code == 200, resp.text

    conn = sqlite3.connect(tmp_db)
    after_row = conn.execute(
        "SELECT centroid FROM discovery_sessions WHERE id = ?", (session_id,)
    ).fetchone()
    conn.close()
    centroid_after = json.loads(after_row[0])

    # Centroid energy should have moved toward 1.0 (KEPT_FEATURES_STUB energy)
    assert centroid_after["energy"] != centroid_before["energy"], (
        "Centroid energy should change after keep feedback"
    )
    assert centroid_after["energy"] > centroid_before["energy"], (
        f"Energy should increase: {centroid_before['energy']} → {centroid_after['energy']}"
    )


def test_discovery_feedback_skip_does_not_update_centroid(client: TestClient, tmp_db: str, mocker):
    """POST /discovery/feedback with action=skip must NOT update the centroid."""
    session_id = _start_session(client, tmp_db, mocker)

    conn = sqlite3.connect(tmp_db)
    before_row = conn.execute(
        "SELECT centroid FROM discovery_sessions WHERE id = ?", (session_id,)
    ).fetchone()
    conn.close()
    centroid_before = json.loads(before_row[0])

    _mock_me(mocker)
    _mock_audio_features(mocker)
    _mock_search_discovery(mocker)

    resp = client.post(
        "/discovery/feedback",
        json={
            "access_token": FAKE_TOKEN,
            "session_id": session_id,
            "track_id": KEPT_TRACK_ID,
            "action": "skip",
        },
    )
    assert resp.status_code == 200, resp.text

    conn = sqlite3.connect(tmp_db)
    after_row = conn.execute(
        "SELECT centroid FROM discovery_sessions WHERE id = ?", (session_id,)
    ).fetchone()
    conn.close()
    centroid_after = json.loads(after_row[0])

    assert centroid_after["energy"] == centroid_before["energy"], (
        "Centroid must not change after skip"
    )


def test_discovery_feedback_returns_next_track(client: TestClient, tmp_db: str, mocker):
    """POST /discovery/feedback must return a track in its response."""
    session_id = _start_session(client, tmp_db, mocker)

    _mock_me(mocker)
    _mock_audio_features(mocker)
    _mock_search_discovery(mocker)

    resp = client.post(
        "/discovery/feedback",
        json={
            "access_token": FAKE_TOKEN,
            "session_id": session_id,
            "track_id": KEPT_TRACK_ID,
            "action": "keep",
        },
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert "track" in data
    # track should be a dict with an id (recommendations mock returns tracks)
    assert data["track"] is not None
    assert data["track"].get("id") == "rec_track_001"


def test_discovery_feedback_logs_event(client: TestClient, tmp_db: str, mocker):
    """POST /discovery/feedback must log a discovery_feedback event."""
    session_id = _start_session(client, tmp_db, mocker)

    _mock_me(mocker)
    _mock_audio_features(mocker)
    _mock_search_discovery(mocker)

    resp = client.post(
        "/discovery/feedback",
        json={
            "access_token": FAKE_TOKEN,
            "session_id": session_id,
            "track_id": KEPT_TRACK_ID,
            "action": "skip",
        },
    )
    assert resp.status_code == 200, resp.text

    conn = sqlite3.connect(tmp_db)
    row = conn.execute(
        "SELECT * FROM interaction_log WHERE event_type = 'discovery_feedback'"
    ).fetchone()
    conn.close()

    assert row is not None, "No discovery_feedback event in interaction_log"


def test_discovery_feedback_invalid_action_returns_422(client: TestClient, tmp_db: str, mocker):
    """POST /discovery/feedback with an invalid action must return 422."""
    _seed_user(tmp_db)
    resp = client.post(
        "/discovery/feedback",
        json={
            "access_token": FAKE_TOKEN,
            "session_id": "any-session",
            "track_id": KEPT_TRACK_ID,
            "action": "love",  # invalid
        },
    )
    assert resp.status_code == 422, f"Expected 422, got {resp.status_code}: {resp.text}"


# ---------------------------------------------------------------------------
# Integration tests: POST /discovery/end
# ---------------------------------------------------------------------------


def test_discovery_end_sets_status_ended(client: TestClient, tmp_db: str, mocker):
    """POST /discovery/end must set discovery_sessions.status = 'ended'."""
    session_id = _start_session(client, tmp_db, mocker)

    _mock_me(mocker)

    resp = client.post(
        "/discovery/end",
        json={"access_token": FAKE_TOKEN, "session_id": session_id},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"status": "ended"}

    conn = sqlite3.connect(tmp_db)
    row = conn.execute(
        "SELECT status FROM discovery_sessions WHERE id = ?", (session_id,)
    ).fetchone()
    conn.close()

    assert row is not None
    assert row[0] == "ended", f"Expected status='ended', got '{row[0]}'"


def test_discovery_end_logs_event(client: TestClient, tmp_db: str, mocker):
    """POST /discovery/end must log a discovery_ended event in interaction_log."""
    session_id = _start_session(client, tmp_db, mocker)

    _mock_me(mocker)

    resp = client.post(
        "/discovery/end",
        json={"access_token": FAKE_TOKEN, "session_id": session_id},
    )
    assert resp.status_code == 200, resp.text

    conn = sqlite3.connect(tmp_db)
    row = conn.execute(
        "SELECT * FROM interaction_log WHERE event_type = 'discovery_ended'"
    ).fetchone()
    conn.close()

    assert row is not None, "No discovery_ended event in interaction_log"
