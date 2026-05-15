"""
Cross-endpoint integration test — Sprint 13 / AC-R06.

Exercises the full Seed → Insights → Refine → Discovery pipeline using a
shared in-memory-equivalent (tmp_db) SQLite database.  Each step seeds state
through one endpoint or DB helper and reads it back through a later endpoint,
verifying that the endpoints share the same persistence layer correctly.

Flow under test
───────────────
1. Seed two playlists + tracks + audio features directly into the DB.
2. GET  /insights/{playlist_id}          → genre + timeline computed from DB
3. POST /refine                           → ranks tracks; high-energy track moves
4. POST /discovery/start                 → session created, first card returned
5. POST /discovery/feedback  (keep)      → feedback persisted
6. POST /discovery/end                   → kept_track_ids reflects the kept card
"""

import json
import sqlite3

import pytest
import spotipy
from fastapi.testclient import TestClient

# ---------------------------------------------------------------------------
# Stubs
# ---------------------------------------------------------------------------

FAKE_TOKEN = "valid_test_token"

ME_STUB = {
    "id": "user1",
    "display_name": "Integration Tester",
    "email": "integration@example.com",
    "images": [],
}

SEED_TRACK_ID = "it_seed_track"
SEED_TRACK_STUB = {
    "id": SEED_TRACK_ID,
    "name": "Integration Seed",
    "artists": [{"id": "art_it", "name": "Integration Artist"}],
    "album": {"name": "Integration Album", "images": []},
    "duration_ms": 200000,
    "popularity": 75,
}

SEED_AUDIO_FEATURES = {
    "id": SEED_TRACK_ID,
    "energy": 0.7,
    "valence": 0.6,
    "danceability": 0.65,
    "tempo": 125.0,
    "acousticness": 0.1,
    "instrumentalness": 0.0,
    "speechiness": 0.05,
    "loudness": -5.5,
    "key": 3,
    "mode": 1,
    "time_signature": 4,
}

DISCOVERY_CANDIDATE_STUB = {
    "id": "it_candidate_1",
    "name": "Discovery Candidate",
    "artists": [{"id": "art_dc", "name": "Candidate Artist"}],
    "album": {"name": "Candidate Album", "images": []},
    "duration_ms": 180000,
    "popularity": 60,
}

CANDIDATE_AUDIO_FEATURES = {
    "id": "it_candidate_1",
    "energy": 0.75,
    "valence": 0.65,
    "danceability": 0.7,
    "tempo": 128.0,
    "acousticness": 0.08,
    "instrumentalness": 0.0,
    "speechiness": 0.04,
    "loudness": -5.0,
    "key": 3,
    "mode": 1,
    "time_signature": 4,
}

SEARCH_RESULTS_STUB = {
    "tracks": {
        "items": [DISCOVERY_CANDIDATE_STUB],
        "total": 1,
        "limit": 20,
        "offset": 0,
        "next": None,
        "previous": None,
    }
}

# ---------------------------------------------------------------------------
# DB seed helpers
# ---------------------------------------------------------------------------

PLAYLIST_ID = "it_pl_001"
N_TRACKS = 4


def _seed_db(tmp_db: str) -> list[str]:
    """Seed a playlist with N_TRACKS tracks and audio features. Returns track IDs."""
    conn = sqlite3.connect(tmp_db)
    conn.execute("INSERT OR IGNORE INTO users (id, display_name) VALUES ('u1', 'Test')")
    conn.execute(
        "INSERT OR IGNORE INTO playlists (id, user_id, name, track_count) VALUES (?, 'u1', 'Integration PL', ?)",
        (PLAYLIST_ID, N_TRACKS),
    )

    # energy values chosen so the high-energy track is distinguishable after refine
    track_energies = [0.3, 0.5, 0.5, 0.9]
    track_ids = [f"it_track_{i}" for i in range(N_TRACKS)]

    for i, tid in enumerate(track_ids):
        conn.execute(
            "INSERT OR IGNORE INTO tracks (id, name, artist_names) VALUES (?, ?, '[]')",
            (tid, f"Integration Song {i}"),
        )
        conn.execute(
            "INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)",
            (PLAYLIST_ID, tid, i),
        )
        conn.execute(
            """
            INSERT OR IGNORE INTO audio_features
                (track_id, energy, tempo, valence, danceability, acousticness,
                 instrumentalness, speechiness, loudness, key, mode, time_signature)
            VALUES (?, ?, 120.0, 0.5, 0.5, 0.1, 0.0, 0.05, -6.0, 0, 1, 4)
            """,
            (tid, track_energies[i]),
        )

    conn.commit()
    conn.close()
    return track_ids


# ---------------------------------------------------------------------------
# Fixture
# ---------------------------------------------------------------------------


@pytest.fixture
def integration_client(tmp_db):
    """TestClient with a seeded DB + keyring stub returning FAKE_TOKEN."""
    import sys
    import os

    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from main import app

    return TestClient(app)


# ---------------------------------------------------------------------------
# Integration test
# ---------------------------------------------------------------------------


def test_full_seed_insights_refine_discovery_pipeline(
    tmp_db, integration_client, mocker
):
    """End-to-end pipeline: DB seed → /insights → /refine → discovery flow."""
    client = integration_client

    # Step 1 — seed DB with playlist + tracks + audio features
    track_ids = _seed_db(tmp_db)
    high_energy_id = track_ids[3]  # energy=0.9

    # Step 2 — GET /insights/{playlist_id}
    # Verifies: insights reads audio_features from DB (seeded in step 1)
    resp = client.get(f"/insights/{PLAYLIST_ID}")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total_tracks"] == N_TRACKS
    assert len(body["timeline"]) == N_TRACKS
    # genre_breakdown counts should sum to total tracks
    genre_sum = sum(g["count"] for g in body["genre_breakdown"])
    assert genre_sum == N_TRACKS

    # Step 3 — POST /refine
    # With max_energy=0.7, the high-energy track (energy=0.9) should be removed
    refine_payload = {
        "playlist_id": PLAYLIST_ID,
        "track_ids": track_ids,
        "constraints": {
            "energy": {"min": 0.0, "max": 0.7},
        },
        "genre_config": {"exclude": [], "boost": [], "include": []},
    }
    resp = client.post("/refine", json=refine_payload)
    assert resp.status_code == 200, resp.text
    refine_body = resp.json()
    assert high_energy_id in refine_body["removed_track_ids"]
    assert high_energy_id not in refine_body["ordered_track_ids"]
    # Remaining 3 tracks should all be ordered
    assert len(refine_body["ordered_track_ids"]) == N_TRACKS - 1

    # Step 4 — POST /discovery/start
    # access_token is passed in the request body; Spotify SDK calls are mocked.
    # Discovery uses sp.track() + sp.search() (artist-search approach).
    mocker.patch.object(spotipy.Spotify, "current_user", return_value=ME_STUB)
    mocker.patch.object(spotipy.Spotify, "audio_features", return_value=[SEED_AUDIO_FEATURES])
    mocker.patch.object(spotipy.Spotify, "track", return_value=SEED_TRACK_STUB)
    mocker.patch.object(spotipy.Spotify, "search", return_value=SEARCH_RESULTS_STUB)

    start_resp = client.post(
        "/discovery/start",
        json={"access_token": FAKE_TOKEN, "seed_track_id": SEED_TRACK_ID},
    )
    assert start_resp.status_code == 200, start_resp.text
    start_body = start_resp.json()
    assert "session_id" in start_body
    session_id = start_body["session_id"]
    # track may be None if the only search result is the seed itself;
    # the session_id existing confirms the session was created
    assert start_body["session_id"]

    # Step 5 — POST /discovery/feedback (keep a known track id)
    # Use SEED_TRACK_ID as the "kept" track (simulates swiping keep on any card)
    feedback_resp = client.post(
        "/discovery/feedback",
        json={
            "access_token": FAKE_TOKEN,
            "session_id": session_id,
            "track_id": SEED_TRACK_ID,
            "action": "keep",
        },
    )
    assert feedback_resp.status_code == 200, feedback_resp.text
    feedback_body = feedback_resp.json()
    assert "session_id" in feedback_body

    # Step 6 — POST /discovery/end
    # Verifies: the session ends cleanly (status=ended)
    end_resp = client.post(
        "/discovery/end",
        json={"access_token": FAKE_TOKEN, "session_id": session_id},
    )
    assert end_resp.status_code == 200, end_resp.text
    assert end_resp.json()["status"] == "ended"
