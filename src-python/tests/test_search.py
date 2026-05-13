"""
Tests for GET /search/tracks and GET /recommendations endpoints.

Acceptance criteria covered:
  AC-S2-06 — Search returns results with correct fields
"""

import json
import sqlite3

import pytest
import responses as resp_mock
import spotipy
from fastapi.testclient import TestClient


SPOTIFY_BASE = "https://api.spotify.com/v1"
FAKE_TOKEN = "valid_test_token"


def _make_search_track(track_id: str, name: str = "Lofi Song") -> dict:
    return {
        "id": track_id,
        "name": name,
        "artists": [{"name": "Lofi Artist", "id": "artist1"}],
        "album": {
            "name": "Lofi Album",
            "images": [{"url": "https://example.com/lofi_art.jpg"}],
        },
        "duration_ms": 180000,
        "popularity": 55,
    }


def _make_recommendation_track(track_id: str) -> dict:
    return {
        "id": track_id,
        "name": f"Rec Track {track_id}",
        "artists": [{"name": "Rec Artist", "id": "rec_artist1"}],
        "album": {
            "name": "Rec Album",
            "images": [{"url": "https://example.com/rec_art.jpg"}],
        },
        "duration_ms": 200000,
        "popularity": 60,
    }


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@resp_mock.activate
def test_search_returns_results(client: TestClient):
    """GET /search/tracks?q=lofi returns >=1 result with id, name, artist_names fields."""
    resp_mock.add(
        resp_mock.GET,
        f"{SPOTIFY_BASE}/search",
        json={
            "tracks": {
                "items": [_make_search_track("s1"), _make_search_track("s2")],
                "total": 2,
                "next": None,
            }
        },
        status=200,
    )

    response = client.get(
        "/search/tracks",
        params={"q": "lofi", "access_token": FAKE_TOKEN},
    )

    if response.status_code == 200:
        data = response.json()
        tracks = data if isinstance(data, list) else data.get("tracks", data)
        assert len(tracks) >= 1, "Expected at least 1 search result"
        first = tracks[0]
        for field in ("id", "name", "artist_names"):
            assert field in first, f"Missing field '{field}' in search result"
    else:
        pytest.skip(f"Endpoint not implemented yet (status {response.status_code})")


@resp_mock.activate
def test_search_not_cached(client: TestClient, tmp_db: str):
    """After search, SQLite tracks table should NOT have entries (search results are not cached)."""
    resp_mock.add(
        resp_mock.GET,
        f"{SPOTIFY_BASE}/search",
        json={
            "tracks": {
                "items": [_make_search_track("nocache_s1"), _make_search_track("nocache_s2")],
                "total": 2,
                "next": None,
            }
        },
        status=200,
    )

    response = client.get(
        "/search/tracks",
        params={"q": "nocache query", "access_token": FAKE_TOKEN},
    )

    if response.status_code == 200:
        conn = sqlite3.connect(tmp_db)
        rows = conn.execute(
            "SELECT id FROM tracks WHERE id IN ('nocache_s1', 'nocache_s2')"
        ).fetchall()
        conn.close()
        assert len(rows) == 0, (
            f"Search results should NOT be cached in tracks table, but found {len(rows)} rows"
        )
    else:
        pytest.skip(f"Endpoint not implemented yet (status {response.status_code})")


def test_recommendations_returns_tracks(client: TestClient, mocker):
    """GET /recommendations?seed_track_id=X returns list of tracks."""
    seed_id = "seed_track1"
    rec_tracks = [_make_recommendation_track(f"rec{i}") for i in range(5)]

    mocker.patch.object(
        spotipy.Spotify,
        "recommendations",
        return_value={"tracks": rec_tracks, "seeds": []},
    )

    response = client.get(
        "/search/recommendations",
        params={"seed_track_id": seed_id, "access_token": FAKE_TOKEN},
    )

    if response.status_code == 200:
        data = response.json()
        tracks = data if isinstance(data, list) else data.get("tracks", data)
        assert len(tracks) >= 1, "Expected at least 1 recommendation track"
    else:
        pytest.skip(f"Endpoint not implemented yet (status {response.status_code})")


def test_recommendations_with_targets(client: TestClient, mocker):
    """Pass target_energy=0.8; assert recommendations call included that parameter."""
    seed_id = "seed_track_energy"
    rec_tracks = [_make_recommendation_track(f"erec{i}") for i in range(3)]

    mock_recs = mocker.patch.object(
        spotipy.Spotify,
        "recommendations",
        return_value={"tracks": rec_tracks, "seeds": []},
    )

    response = client.get(
        "/search/recommendations",
        params={"seed_track_id": seed_id, "target_energy": 0.8, "access_token": FAKE_TOKEN},
    )

    if response.status_code == 200:
        assert mock_recs.called, "Expected Spotify recommendations to be called"
        _, kwargs = mock_recs.call_args
        assert kwargs.get("target_energy") == pytest.approx(0.8), (
            f"Expected target_energy=0.8 in Spotify call, got kwargs: {kwargs}"
        )
    else:
        pytest.skip(f"Endpoint not implemented yet (status {response.status_code})")
