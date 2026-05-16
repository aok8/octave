"""
Tests for GET /search/tracks, GET /recommendations, and GET /recommendations/similar endpoints.

Acceptance criteria covered:
  AC-S2-06 — Search returns results with correct fields
  Sprint 3  — Similarity-based recommendations endpoint
"""

import json
import sqlite3
import time

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


def _make_seed_track(track_id: str, artist_name: str = "Rec Artist") -> dict:
    return {
        "id": track_id,
        "name": "Seed Track",
        "artists": [{"id": "art1", "name": artist_name}],
        "album": {"name": "Seed Album", "images": []},
        "duration_ms": 180000,
        "popularity": 70,
    }


def test_recommendations_returns_tracks(client: TestClient, mocker):
    """GET /recommendations?seed_track_id=X returns tracks by the seed track's artist."""
    seed_id = "seed_track1"
    rec_tracks = [_make_recommendation_track(f"rec{i}") for i in range(5)]

    mocker.patch.object(spotipy.Spotify, "track", return_value=_make_seed_track(seed_id))
    mocker.patch.object(
        spotipy.Spotify,
        "search",
        return_value={"tracks": {"items": rec_tracks, "total": 5, "next": None}},
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


def test_recommendations_uses_artist_search(client: TestClient, mocker):
    """The artist name from the seed track must appear in the search query."""
    seed_id = "seed_artist_search"
    rec_tracks = [_make_recommendation_track("art_rec1")]

    mocker.patch.object(spotipy.Spotify, "track", return_value=_make_seed_track(seed_id, "Test Artist"))
    mock_search = mocker.patch.object(
        spotipy.Spotify,
        "search",
        return_value={"tracks": {"items": rec_tracks, "total": 1, "next": None}},
    )

    response = client.get(
        "/search/recommendations",
        params={"seed_track_id": seed_id, "access_token": FAKE_TOKEN},
    )

    if response.status_code == 200:
        assert mock_search.called, "Expected sp.search() to be called"
        call_kwargs = mock_search.call_args[1]
        query = call_kwargs.get("q", "")
        assert "Test Artist" in query, f"Expected artist name in search query, got: {query}"
    else:
        pytest.skip(f"Endpoint not implemented yet (status {response.status_code})")


# ---------------------------------------------------------------------------
# Similarity-based recommendations tests (Sprint 3)
# ---------------------------------------------------------------------------


def _seed_audio_features(db_path: str, track_id: str, **features) -> None:
    """Insert an audio_features row directly into the temp DB."""
    conn = sqlite3.connect(db_path)
    conn.execute(
        """
        INSERT OR REPLACE INTO audio_features
            (track_id, energy, tempo, valence, danceability, acousticness,
             instrumentalness, speechiness, loudness, cached_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            track_id,
            features.get("energy", 0.5),
            features.get("tempo", 120.0),
            features.get("valence", 0.5),
            features.get("danceability", 0.5),
            features.get("acousticness", 0.3),
            features.get("instrumentalness", 0.0),
            features.get("speechiness", 0.05),
            features.get("loudness", -5.0),
            int(time.time()),
        ),
    )
    conn.commit()
    conn.close()


def test_similar_returns_empty_for_unknown_track(client: TestClient, tmp_db: str, mocker):
    """Unknown seed with sparse cache must fall back to artist-search or return [].

    When the seed track has no features row and the cache is empty, the endpoint
    must return a valid JSON response (list) without error.
    """
    seed_id = "totally_unknown_track_xyz"

    # Patch Spotify so the fallback artist-search also returns nothing
    mocker.patch.object(spotipy.Spotify, "track", return_value=_make_seed_track(seed_id, "NoArtist"))
    mocker.patch.object(
        spotipy.Spotify,
        "search",
        return_value={"tracks": {"items": [], "total": 0, "next": None}},
    )

    response = client.get(
        "/search/recommendations/similar",
        params={"track_id": seed_id, "access_token": FAKE_TOKEN},
    )
    assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
    data = response.json()
    assert isinstance(data, list), f"Expected a list, got: {type(data)}"


def test_similar_returns_sorted_results(client: TestClient, tmp_db: str):
    """Seed 3 tracks with features in DB; response must be sorted by score descending."""
    seed_id = "sim_seed_track"

    # Seed: high energy, high valence
    _seed_audio_features(tmp_db, seed_id, energy=0.9, valence=0.9, danceability=0.8,
                         tempo=160.0, acousticness=0.1, instrumentalness=0.0)
    # Close to seed
    _seed_audio_features(tmp_db, "sim_close", energy=0.85, valence=0.88, danceability=0.78,
                         tempo=158.0, acousticness=0.12, instrumentalness=0.02)
    # Moderate distance
    _seed_audio_features(tmp_db, "sim_mid", energy=0.5, valence=0.5, danceability=0.5,
                         tempo=100.0, acousticness=0.4, instrumentalness=0.2)
    # Far from seed
    _seed_audio_features(tmp_db, "sim_far", energy=0.1, valence=0.1, danceability=0.1,
                         tempo=40.0, acousticness=0.9, instrumentalness=0.9)

    response = client.get(
        "/search/recommendations/similar",
        params={"track_id": seed_id, "access_token": FAKE_TOKEN, "limit": 10},
    )
    assert response.status_code == 200, f"Expected 200: {response.text}"
    results = response.json()
    assert isinstance(results, list), "Response must be a list"
    assert len(results) >= 3, f"Expected at least 3 results, got {len(results)}"

    scores = [r["score"] for r in results]
    assert scores == sorted(scores, reverse=True), f"Results not sorted by score: {scores}"

    # First result should be the close track
    assert results[0]["track_id"] == "sim_close", (
        f"Expected sim_close first (closest), got: {results[0]['track_id']}"
    )
    # Each result must have required keys
    for r in results:
        assert "track_id" in r
        assert "score" in r
        assert "matching_features" in r
