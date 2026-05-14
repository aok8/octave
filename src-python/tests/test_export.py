"""
Tests for POST /export/new and POST /export/overwrite/{playlist_id} endpoints.

Acceptance criteria:
  - POST /export/new happy path: Spotify playlist created, tracks added, URL returned
  - POST /export/new name > 100 chars → 422
  - POST /export/new empty track_ids → 422
  - POST /export/new description > 300 chars → 422
  - POST /export/overwrite/{id} happy path: tracks replaced, URL returned
  - POST /export/overwrite/{id} empty track_ids → 422
  - playlist_exported event written to interaction_log
"""

import json
import sqlite3
import sys
import os

import pytest
import spotipy

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient

PLAYLIST_ID = "existing_playlist_id"
NEW_PLAYLIST_ID = "new_playlist_id"
SPOTIFY_URL = f"https://open.spotify.com/playlist/{NEW_PLAYLIST_ID}"
MOCK_TOKEN = "mock_access_token"


# ---------------------------------------------------------------------------
# Spotify mock helpers
# ---------------------------------------------------------------------------


def _mock_current_user(mocker):
    mocker.patch.object(
        spotipy.Spotify,
        "current_user",
        return_value={"id": "test_user"},
    )


def _mock_user_playlist_create(mocker, playlist_id=NEW_PLAYLIST_ID):
    mocker.patch.object(
        spotipy.Spotify,
        "user_playlist_create",
        return_value={
            "id": playlist_id,
            "external_urls": {"spotify": f"https://open.spotify.com/playlist/{playlist_id}"},
        },
    )


def _mock_playlist_add_items(mocker):
    mocker.patch.object(
        spotipy.Spotify,
        "playlist_add_items",
        return_value=None,
    )


def _mock_playlist_replace_items(mocker):
    mocker.patch.object(
        spotipy.Spotify,
        "playlist_replace_items",
        return_value=None,
    )


# ---------------------------------------------------------------------------
# Tests — POST /export/new
# ---------------------------------------------------------------------------


def test_export_new_happy_path(client: TestClient, tmp_db: str, mocker):
    """Happy path: playlist created, tracks added, correct URL returned."""
    _mock_current_user(mocker)
    _mock_user_playlist_create(mocker)
    _mock_playlist_add_items(mocker)

    resp = client.post(
        "/export/new",
        json={
            "name": "My Refined Playlist",
            "description": "Created with Octave",
            "track_ids": ["t1", "t2", "t3"],
            "token": MOCK_TOKEN,
        },
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["playlist_id"] == NEW_PLAYLIST_ID
    assert "open.spotify.com/playlist" in data["playlist_url"]

    # Verify Spotify methods were called
    spotipy.Spotify.user_playlist_create.assert_called_once()
    spotipy.Spotify.playlist_add_items.assert_called()


def test_export_new_name_too_long(client: TestClient, tmp_db: str):
    """name > 100 characters → 422."""
    resp = client.post(
        "/export/new",
        json={
            "name": "A" * 101,
            "description": "OK",
            "track_ids": ["t1"],
            "token": MOCK_TOKEN,
        },
    )
    assert resp.status_code == 422, resp.text
    detail = resp.json()["detail"]
    assert detail["field"] == "name"
    assert "100" in detail["error"]


def test_export_new_empty_track_ids(client: TestClient, tmp_db: str):
    """Empty track_ids → 422."""
    resp = client.post(
        "/export/new",
        json={
            "name": "Valid Name",
            "description": "OK",
            "track_ids": [],
            "token": MOCK_TOKEN,
        },
    )
    assert resp.status_code == 422, resp.text
    detail = resp.json()["detail"]
    assert detail["field"] == "track_ids"


def test_export_new_description_too_long(client: TestClient, tmp_db: str):
    """description > 300 characters → 422."""
    resp = client.post(
        "/export/new",
        json={
            "name": "Valid Name",
            "description": "D" * 301,
            "track_ids": ["t1"],
            "token": MOCK_TOKEN,
        },
    )
    assert resp.status_code == 422, resp.text
    detail = resp.json()["detail"]
    assert detail["field"] == "description"
    assert "300" in detail["error"]


# ---------------------------------------------------------------------------
# Tests — POST /export/overwrite/{playlist_id}
# ---------------------------------------------------------------------------


def test_export_overwrite_happy_path(client: TestClient, tmp_db: str, mocker):
    """Happy path: tracks replaced in existing playlist, URL returned."""
    _mock_playlist_replace_items(mocker)
    _mock_playlist_add_items(mocker)

    resp = client.post(
        f"/export/overwrite/{PLAYLIST_ID}",
        json={
            "track_ids": ["t1", "t2", "t3"],
            "token": MOCK_TOKEN,
        },
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["playlist_id"] == PLAYLIST_ID
    assert PLAYLIST_ID in data["playlist_url"]

    # playlist_replace_items must be called for the atomic replace
    spotipy.Spotify.playlist_replace_items.assert_called_once()


def test_export_overwrite_empty_track_ids(client: TestClient, tmp_db: str):
    """Empty track_ids → 422."""
    resp = client.post(
        f"/export/overwrite/{PLAYLIST_ID}",
        json={
            "track_ids": [],
            "token": MOCK_TOKEN,
        },
    )
    assert resp.status_code == 422, resp.text
    detail = resp.json()["detail"]
    assert detail["field"] == "track_ids"


# ---------------------------------------------------------------------------
# Tests — interaction_log
# ---------------------------------------------------------------------------


def test_playlist_exported_event_logged_new(client: TestClient, tmp_db: str, mocker):
    """POST /export/new must append a playlist_exported row to interaction_log."""
    _mock_current_user(mocker)
    _mock_user_playlist_create(mocker)
    _mock_playlist_add_items(mocker)

    resp = client.post(
        "/export/new",
        json={
            "name": "Log Test Playlist",
            "description": "",
            "track_ids": ["tlog1", "tlog2"],
            "token": MOCK_TOKEN,
        },
    )
    assert resp.status_code == 200, resp.text

    conn = sqlite3.connect(tmp_db)
    rows = conn.execute(
        "SELECT * FROM interaction_log WHERE event_type = 'playlist_exported'"
    ).fetchall()
    conn.close()

    assert len(rows) >= 1, "Expected at least one playlist_exported row in interaction_log"
    row = rows[-1]
    event_data = json.loads(row[4])  # event_data column
    assert event_data.get("mode") == "new"
    assert event_data.get("track_count") == 2


def test_playlist_exported_event_logged_overwrite(client: TestClient, tmp_db: str, mocker):
    """POST /export/overwrite must append a playlist_exported row to interaction_log."""
    _mock_playlist_replace_items(mocker)
    _mock_playlist_add_items(mocker)

    resp = client.post(
        f"/export/overwrite/{PLAYLIST_ID}",
        json={
            "track_ids": ["tlog1", "tlog2", "tlog3"],
            "token": MOCK_TOKEN,
        },
    )
    assert resp.status_code == 200, resp.text

    conn = sqlite3.connect(tmp_db)
    rows = conn.execute(
        "SELECT * FROM interaction_log WHERE event_type = 'playlist_exported'"
    ).fetchall()
    conn.close()

    assert len(rows) >= 1, "Expected at least one playlist_exported row in interaction_log"
    row = rows[-1]
    event_data = json.loads(row[4])  # event_data column
    assert event_data.get("mode") == "overwrite"
    assert event_data.get("playlist_id") == PLAYLIST_ID
    assert event_data.get("track_count") == 3
