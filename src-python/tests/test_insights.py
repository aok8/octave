"""
Tests for GET /insights/{playlist_id} endpoint.

Acceptance criteria:
  AC-S3-06 — genre counts sum to total_tracks
  AC-S3-07 — timeline length equals total_tracks
  AC-S3-09 — mock_genres=true returns diverse genres (all 6 buckets + Other)
  AC-S3-10 — interaction_log receives an insights_viewed event
  AC-S3-11 — 404 when playlist_id not found in DB
"""

import json
import sqlite3

import pytest
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient

PLAYLIST_ID = "pl_insights_test"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _seed_playlist(tmp_db: str, playlist_id: str, n_tracks: int) -> None:
    """Insert a playlist and n_tracks worth of tracks + audio features into tmp_db."""
    conn = sqlite3.connect(tmp_db)
    conn.row_factory = sqlite3.Row

    conn.execute("INSERT OR IGNORE INTO users (id, display_name) VALUES ('u1', 'Test')")
    conn.execute(
        "INSERT OR IGNORE INTO playlists (id, user_id, name, track_count) VALUES (?, 'u1', 'Insights PL', ?)",
        (playlist_id, n_tracks),
    )

    import time

    for i in range(n_tracks):
        tid = f"track_{i}"
        conn.execute(
            "INSERT OR IGNORE INTO tracks (id, name, artist_names) VALUES (?, ?, '[]')",
            (tid, f"Song {i}"),
        )
        conn.execute(
            "INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)",
            (playlist_id, tid, i),
        )
        conn.execute(
            """
            INSERT OR IGNORE INTO audio_features
                (track_id, energy, tempo, valence, danceability, acousticness,
                 instrumentalness, speechiness, loudness, key, mode, time_signature)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (tid, 0.5 + i * 0.001, 120.0, 0.4, 0.6, 0.1, 0.0, 0.05, -6.0, 0, 1, 4),
        )

    conn.commit()
    conn.close()


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_genre_counts_sum_to_total_tracks(client: TestClient, tmp_db: str):
    """Genre counts in breakdown must sum to total_tracks."""
    _seed_playlist(tmp_db, PLAYLIST_ID, 42)

    resp = client.get(f"/insights/{PLAYLIST_ID}")
    assert resp.status_code == 200, resp.text
    data = resp.json()

    total = data["total_tracks"]
    assert total == 42

    genre_sum = sum(g["count"] for g in data["genre_breakdown"])
    assert genre_sum == total, f"Genre counts {genre_sum} != total_tracks {total}"


def test_timeline_length_equals_total_tracks(client: TestClient, tmp_db: str):
    """Timeline list must have exactly total_tracks entries."""
    _seed_playlist(tmp_db, PLAYLIST_ID, 42)

    resp = client.get(f"/insights/{PLAYLIST_ID}")
    assert resp.status_code == 200, resp.text
    data = resp.json()

    assert len(data["timeline"]) == data["total_tracks"]


def test_mock_genres_returns_diverse_genres(client: TestClient, tmp_db: str):
    """?mock_genres=true must return at least 2 distinct genre buckets."""
    _seed_playlist(tmp_db, PLAYLIST_ID, 42)

    resp = client.get(f"/insights/{PLAYLIST_ID}", params={"mock_genres": "true"})
    assert resp.status_code == 200, resp.text
    data = resp.json()

    genres_in_breakdown = {g["genre"] for g in data["genre_breakdown"]}
    assert len(genres_in_breakdown) >= 2, (
        f"Expected diverse genres with mock_genres=true, got: {genres_in_breakdown}"
    )
    # With 42 tracks cycling through 7 mock genres we expect all 7
    assert len(genres_in_breakdown) >= 6, (
        f"Expected >=6 distinct genres for 42-track fixture, got: {genres_in_breakdown}"
    )


def test_interaction_log_receives_insights_viewed(client: TestClient, tmp_db: str):
    """Calling the endpoint must append an insights_viewed row to interaction_log."""
    _seed_playlist(tmp_db, PLAYLIST_ID, 5)

    resp = client.get(f"/insights/{PLAYLIST_ID}")
    assert resp.status_code == 200, resp.text

    conn = sqlite3.connect(tmp_db)
    rows = conn.execute(
        "SELECT * FROM interaction_log WHERE event_type = 'insights_viewed'"
    ).fetchall()
    conn.close()

    assert len(rows) >= 1, "Expected at least one insights_viewed row in interaction_log"


def test_404_for_unknown_playlist(client: TestClient, tmp_db: str):
    """GET /insights/<nonexistent> must return 404."""
    resp = client.get("/insights/does_not_exist_xyz")
    assert resp.status_code == 404, resp.text


def test_response_shape(client: TestClient, tmp_db: str):
    """Response must contain playlist_id, genre_breakdown, timeline, total_tracks."""
    _seed_playlist(tmp_db, PLAYLIST_ID, 3)

    resp = client.get(f"/insights/{PLAYLIST_ID}")
    assert resp.status_code == 200, resp.text
    data = resp.json()

    for field in ("playlist_id", "genre_breakdown", "timeline", "total_tracks"):
        assert field in data, f"Missing field: {field}"

    assert data["playlist_id"] == PLAYLIST_ID

    # Each genre_breakdown entry must have genre, count, color, subgenres
    for entry in data["genre_breakdown"]:
        for key in ("genre", "count", "color", "subgenres"):
            assert key in entry, f"genre_breakdown entry missing key: {key}"

    # Each timeline entry must have position, track_id, genre, tempo, popularity, key
    for entry in data["timeline"]:
        for key in ("position", "track_id", "genre", "tempo", "popularity", "key"):
            assert key in entry, f"timeline entry missing key: {key}"

    # key_distribution must be present (may be empty if no features)
    assert "key_distribution" in data, "Missing field: key_distribution"
    assert isinstance(data["key_distribution"], dict)


def test_synthetic_fraction_all_synthetic(client: TestClient, tmp_db: str):
    """synthetic_fraction must be 1.0 when all tracks have the exact synthetic values."""
    conn = sqlite3.connect(tmp_db)
    pid = "pl_synth_all"
    conn.execute("INSERT OR IGNORE INTO users (id, display_name) VALUES ('u1', 'Test')")
    conn.execute(
        "INSERT OR IGNORE INTO playlists (id, user_id, name, track_count) VALUES (?, 'u1', 'Synth PL', 3)",
        (pid,),
    )
    for i in range(3):
        tid = f"synth_all_{i}"
        conn.execute(
            "INSERT OR IGNORE INTO tracks (id, name, artist_names) VALUES (?, ?, '[]')",
            (tid, f"Track {i}"),
        )
        conn.execute(
            "INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)",
            (pid, tid, i),
        )
        # Exact synthetic values: energy=0.5, valence=0.5, danceability=0.5, tempo=120.0
        conn.execute(
            """
            INSERT OR IGNORE INTO audio_features
                (track_id, energy, tempo, valence, danceability, acousticness,
                 instrumentalness, speechiness, loudness, key, mode, time_signature)
            VALUES (?, 0.5, 120.0, 0.5, 0.5, 0.3, 0.1, 0.05, -8.0, 0, 1, 4)
            """,
            (tid,),
        )
    conn.commit()
    conn.close()

    resp = client.get(f"/insights/{pid}")
    assert resp.status_code == 200, resp.text
    data = resp.json()

    assert "synthetic_fraction" in data, "Missing field: synthetic_fraction"
    assert data["synthetic_fraction"] == 1.0, (
        f"Expected synthetic_fraction=1.0 for all-synthetic playlist, got {data['synthetic_fraction']}"
    )


def test_synthetic_fraction_partial(client: TestClient, tmp_db: str):
    """synthetic_fraction is between 0 and 1 when only some tracks use synthetic values."""
    conn = sqlite3.connect(tmp_db)
    pid = "pl_synth_partial"
    conn.execute("INSERT OR IGNORE INTO users (id, display_name) VALUES ('u1', 'Test')")
    conn.execute(
        "INSERT OR IGNORE INTO playlists (id, user_id, name, track_count) VALUES (?, 'u1', 'Partial PL', 4)",
        (pid,),
    )
    # 2 synthetic tracks (energy=valence=danceability=0.5) and 2 real tracks
    for i in range(4):
        tid = f"synth_partial_{i}"
        conn.execute(
            "INSERT OR IGNORE INTO tracks (id, name, artist_names) VALUES (?, ?, '[]')",
            (tid, f"Track {i}"),
        )
        conn.execute(
            "INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)",
            (pid, tid, i),
        )
        if i < 2:
            # Synthetic values
            conn.execute(
                """
                INSERT OR IGNORE INTO audio_features
                    (track_id, energy, tempo, valence, danceability, acousticness,
                     instrumentalness, speechiness, loudness, key, mode, time_signature)
                VALUES (?, 0.5, 120.0, 0.5, 0.5, 0.3, 0.1, 0.05, -8.0, 0, 1, 4)
                """,
                (tid,),
            )
        else:
            # Real values — distinct from synthetic fingerprint
            conn.execute(
                """
                INSERT OR IGNORE INTO audio_features
                    (track_id, energy, tempo, valence, danceability, acousticness,
                     instrumentalness, speechiness, loudness, key, mode, time_signature)
                VALUES (?, 0.8, 135.0, 0.7, 0.85, 0.1, 0.0, 0.03, -5.0, 2, 1, 4)
                """,
                (tid,),
            )
    conn.commit()
    conn.close()

    resp = client.get(f"/insights/{pid}")
    assert resp.status_code == 200, resp.text
    data = resp.json()

    assert "synthetic_fraction" in data, "Missing field: synthetic_fraction"
    frac = data["synthetic_fraction"]
    assert 0.0 < frac < 1.0, (
        f"Expected 0 < synthetic_fraction < 1 for partial playlist, got {frac}"
    )
    # 2 out of 4 tracks are synthetic → 0.5
    assert abs(frac - 0.5) < 1e-9, f"Expected synthetic_fraction=0.5, got {frac}"


def test_advanced_insights_fields(client: TestClient, tmp_db: str):
    """AC-S14-01 — timeline entries include tempo, popularity, key; key_distribution present."""
    # Seed with distinct tempo/key values per track
    conn = __import__("sqlite3").connect(tmp_db)
    conn.execute("INSERT OR IGNORE INTO users (id, display_name) VALUES ('u1', 'Test')")
    pid = "pl_adv_test"
    conn.execute(
        "INSERT OR IGNORE INTO playlists (id, user_id, name, track_count) VALUES (?, 'u1', 'Adv PL', 4)",
        (pid,),
    )
    # key=0 (C major) and key=5 (F major) tracks — two distinct keys
    tracks = [
        {"tid": "adv_t0", "tempo": 110.0, "key": 0, "mode": 1, "pop": 60},
        {"tid": "adv_t1", "tempo": 125.0, "key": 5, "mode": 1, "pop": 75},
        {"tid": "adv_t2", "tempo": 90.0,  "key": 0, "mode": 0, "pop": 50},
        {"tid": "adv_t3", "tempo": 140.0, "key": 5, "mode": 0, "pop": 80},
    ]
    for i, t in enumerate(tracks):
        conn.execute(
            "INSERT OR IGNORE INTO tracks (id, name, artist_names, popularity) VALUES (?, ?, '[]', ?)",
            (t["tid"], f"Song {i}", t["pop"]),
        )
        conn.execute(
            "INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)",
            (pid, t["tid"], i),
        )
        conn.execute(
            """
            INSERT OR IGNORE INTO audio_features
                (track_id, energy, tempo, valence, danceability, acousticness,
                 instrumentalness, speechiness, loudness, key, mode, time_signature)
            VALUES (?, 0.5, ?, 0.5, 0.5, 0.1, 0.0, 0.05, -6.0, ?, ?, 4)
            """,
            (t["tid"], t["tempo"], t["key"], t["mode"]),
        )
    conn.commit()
    conn.close()

    resp = client.get(f"/insights/{pid}")
    assert resp.status_code == 200, resp.text
    data = resp.json()

    # Tempo is returned per track
    tempos = [e["tempo"] for e in data["timeline"]]
    assert 110.0 in tempos
    assert 140.0 in tempos

    # Popularity is returned per track
    pops = [e["popularity"] for e in data["timeline"]]
    assert 60 in pops
    assert 80 in pops

    # key field maps pitch class to note name
    keys = [e["key"] for e in data["timeline"]]
    assert "C" in keys      # key=0, mode=1
    assert "Cm" in keys     # key=0, mode=0
    assert "F" in keys      # key=5, mode=1
    assert "Fm" in keys     # key=5, mode=0

    # key_distribution aggregates correctly — 2 tracks each in C/Cm and F/Fm
    kd = data["key_distribution"]
    assert kd.get("C") == 1
    assert kd.get("Cm") == 1
    assert kd.get("F") == 1
    assert kd.get("Fm") == 1
