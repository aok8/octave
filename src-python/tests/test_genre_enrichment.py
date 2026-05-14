"""
Tests for artist genre enrichment in the playlist track ingestion pipeline.

These tests verify that:
- sp.artists() is called during track ingestion
- genres returned by sp.artists() are stored via update_track_genres
- insights endpoint uses stored genres instead of defaulting to "Other"
"""
import json
import sqlite3

import spotipy
from fastapi.testclient import TestClient


# ---------------------------------------------------------------------------
# Constants / stubs
# ---------------------------------------------------------------------------

SPOTIFY_BASE = "https://api.spotify.com/v1"
FAKE_TOKEN = "valid_test_token"

ME_STUB = {
    "id": "user1",
    "display_name": "Test User",
    "email": "test@example.com",
    "images": [],
}

TRACK_WITH_ARTIST_STUB = {
    "track": {
        "id": "track_enrich_1",
        "name": "Enrich Song",
        "artists": [{"id": "a1", "name": "Test Artist"}],
        "album": {
            "name": "Enrich Album",
            "images": [{"url": "https://example.com/art.jpg"}],
        },
        "duration_ms": 210000,
        "popularity": 65,
    },
    "added_at": "2024-06-01T00:00:00Z",
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _seed_user_and_playlist(tmp_db: str, playlist_id: str) -> None:
    """Insert a user and playlist row so FK constraints are satisfied."""
    conn = sqlite3.connect(tmp_db)
    conn.execute("INSERT OR IGNORE INTO users (id, display_name) VALUES ('user1', 'Test User')")
    conn.execute(
        "INSERT OR IGNORE INTO playlists (id, user_id, name, track_count) VALUES (?, 'user1', 'Enrich PL', 1)",
        (playlist_id,),
    )
    conn.commit()
    conn.close()


def _seed_playlist_with_genres(
    tmp_db: str, playlist_id: str, track_id: str, genres_json: str
) -> None:
    """Insert a playlist + track with pre-populated genres for insights tests."""
    conn = sqlite3.connect(tmp_db)
    conn.execute("INSERT OR IGNORE INTO users (id, display_name) VALUES ('u1', 'Test')")
    conn.execute(
        "INSERT OR IGNORE INTO playlists (id, user_id, name, track_count) VALUES (?, 'u1', 'Genre PL', 1)",
        (playlist_id,),
    )
    conn.execute(
        "INSERT OR IGNORE INTO tracks (id, name, artist_names, genres) VALUES (?, 'Genre Track', '[]', ?)",
        (track_id, genres_json),
    )
    conn.execute(
        "INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, 0)",
        (playlist_id, track_id),
    )
    conn.commit()
    conn.close()


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_playlist_tracks_enriches_genres(client: TestClient, tmp_db: str, mocker):
    """Track ingestion must call sp.artists() and store returned genres in the DB."""
    playlist_id = "pl_enrich_test"
    track_id = "track_enrich_1"
    artist_id = "a1"

    _seed_user_and_playlist(tmp_db, playlist_id)

    # Mock the deprecated playlist_items endpoint
    mocker.patch.object(
        spotipy.Spotify,
        "playlist_items",
        return_value={
            "items": [TRACK_WITH_ARTIST_STUB],
            "total": 1,
            "next": None,
            "offset": 0,
            "limit": 100,
        },
    )

    # Mock sp.artists() with mocker.patch.object to avoid responses_lib URL
    # matching conflicts with the except Exception: pass swallowing ConnectionErrors
    mocker.patch.object(
        spotipy.Spotify,
        "artists",
        return_value={
            "artists": [
                {"id": artist_id, "name": "Test Artist", "genres": ["hip-hop", "trap"]}
            ]
        },
    )

    response = client.get(
        f"/playlists/{playlist_id}/tracks",
        params={"access_token": FAKE_TOKEN},
    )

    assert response.status_code == 200, response.text

    # Verify genres were stored in the DB
    conn = sqlite3.connect(tmp_db)
    row = conn.execute(
        "SELECT genres FROM tracks WHERE id = ?", (track_id,)
    ).fetchone()
    conn.close()

    assert row is not None, f"Track '{track_id}' not found in DB"
    genres_stored = row[0]
    assert genres_stored is not None, "genres column is NULL — enrichment did not run"

    genres_list = json.loads(genres_stored)
    assert "hip-hop" in genres_list, (
        f"Expected 'hip-hop' in stored genres, got: {genres_list}"
    )


def test_insights_uses_stored_genres(client: TestClient, tmp_db: str):
    """Insights endpoint must classify tracks using stored genres, not default to 'Other'."""
    playlist_id = "pl_insights_genre_test"
    track_id = "track_neo_soul_1"

    # Seed a track with neo soul / alternative r&b genres pre-stored
    _seed_playlist_with_genres(
        tmp_db,
        playlist_id,
        track_id,
        json.dumps(["neo soul", "alternative r&b"]),
    )

    response = client.get(f"/insights/{playlist_id}")
    assert response.status_code == 200, response.text

    data = response.json()
    genre_breakdown = data["genre_breakdown"]

    genres_present = {entry["genre"] for entry in genre_breakdown}

    # With neo soul genres stored, we should see Neo-Soul or RnB — not only Other
    assert genres_present != {"Other"}, (
        f"Expected stored genres to produce a non-Other bucket, got: {genres_present}"
    )
    assert "Neo-Soul" in genres_present or "RnB" in genres_present, (
        f"Expected 'Neo-Soul' or 'RnB' from 'neo soul'/'alternative r&b' genres, "
        f"got: {genres_present}"
    )
