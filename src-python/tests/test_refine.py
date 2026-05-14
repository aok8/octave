"""
Tests for POST /refine endpoint.

Acceptance criteria:
  - Happy path: 5 tracks, no constraints → all 5 in ordered_track_ids, empty removed_track_ids
  - Energy constraint: tracks above max energy → appear in removed_track_ids
  - Genre exclude: tracks in excluded genre → removed (v1: all genres are "Other", so genre ops
    have no effect unless genre data is real; tests verify the endpoint wiring is correct)
  - Genre boost: boosted genre tracks appear first in ordered_track_ids
  - Empty audio features → 404
  - refine_applied event written to interaction_log
"""

import json
import sqlite3
import sys
import os

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient

PLAYLIST_ID = "pl_refine_test"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _seed_audio_features(tmp_db: str, tracks: list[dict]) -> None:
    """Insert audio features rows into the DB for the given track dicts.

    Each dict must have ``track_id`` plus any subset of the feature columns.
    """
    conn = sqlite3.connect(tmp_db)
    for t in tracks:
        conn.execute(
            """
            INSERT OR IGNORE INTO audio_features
                (track_id, energy, tempo, valence, danceability, acousticness,
                 instrumentalness, speechiness, loudness, key, mode, time_signature)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                t["track_id"],
                t.get("energy", 0.5),
                t.get("tempo", 120.0),
                t.get("valence", 0.5),
                t.get("danceability", 0.5),
                t.get("acousticness", 0.1),
                t.get("instrumentalness", 0.0),
                t.get("speechiness", 0.05),
                t.get("loudness", -6.0),
                t.get("key", 0),
                t.get("mode", 1),
                t.get("time_signature", 4),
            ),
        )
    conn.commit()
    conn.close()


def _make_track(track_id: str, **kwargs) -> dict:
    defaults = {
        "energy": 0.5,
        "tempo": 120.0,
        "valence": 0.5,
        "danceability": 0.5,
        "acousticness": 0.1,
        "instrumentalness": 0.0,
    }
    defaults.update(kwargs)
    defaults["track_id"] = track_id
    return defaults


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_happy_path_no_constraints(client: TestClient, tmp_db: str):
    """5 tracks, no constraints → all 5 in ordered_track_ids, removed_track_ids empty."""
    tracks = [_make_track(f"t{i}") for i in range(1, 6)]
    _seed_audio_features(tmp_db, tracks)
    track_ids = [t["track_id"] for t in tracks]

    resp = client.post(
        "/refine",
        json={
            "playlist_id": PLAYLIST_ID,
            "track_ids": track_ids,
            "constraints": {},
            "genre_config": {},
        },
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()

    assert set(data["ordered_track_ids"]) == set(track_ids)
    assert data["removed_track_ids"] == []


def test_energy_constraint_removes_high_energy_tracks(client: TestClient, tmp_db: str):
    """Tracks above energy max appear in removed_track_ids."""
    tracks = [
        _make_track("low1", energy=0.2),
        _make_track("low2", energy=0.3),
        _make_track("high1", energy=0.8),
        _make_track("high2", energy=0.9),
        _make_track("high3", energy=0.95),
    ]
    _seed_audio_features(tmp_db, tracks)

    resp = client.post(
        "/refine",
        json={
            "playlist_id": PLAYLIST_ID,
            "track_ids": [t["track_id"] for t in tracks],
            "constraints": {"energy": {"max": 0.5}},
            "genre_config": {},
        },
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()

    # The 3 high-energy tracks must be removed
    for tid in ("high1", "high2", "high3"):
        assert tid in data["removed_track_ids"], f"{tid} should be removed"
        assert tid not in data["ordered_track_ids"], f"{tid} should not be ordered"

    # The 2 low-energy tracks must be kept
    for tid in ("low1", "low2"):
        assert tid in data["ordered_track_ids"], f"{tid} should be ordered"


def test_genre_exclude_no_effect_in_v1(client: TestClient, tmp_db: str):
    """In v1 all tracks are 'Other', so excluding 'Hip-Hop' removes nothing."""
    tracks = [_make_track(f"t{i}") for i in range(1, 4)]
    _seed_audio_features(tmp_db, tracks)

    resp = client.post(
        "/refine",
        json={
            "playlist_id": PLAYLIST_ID,
            "track_ids": [t["track_id"] for t in tracks],
            "constraints": {},
            "genre_config": {"exclude": ["Hip-Hop"]},
        },
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()

    # "Other" genre is not in the exclude list, so all tracks pass
    assert set(data["ordered_track_ids"]) == {"t1", "t2", "t3"}
    assert data["removed_track_ids"] == []


def test_genre_exclude_other_removes_all_v1(client: TestClient, tmp_db: str):
    """Excluding 'Other' removes all tracks in v1 (all are classified Other)."""
    tracks = [_make_track(f"t{i}") for i in range(1, 4)]
    _seed_audio_features(tmp_db, tracks)

    resp = client.post(
        "/refine",
        json={
            "playlist_id": PLAYLIST_ID,
            "track_ids": [t["track_id"] for t in tracks],
            "constraints": {},
            "genre_config": {"exclude": ["Other"]},
        },
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()

    assert data["ordered_track_ids"] == []
    assert set(data["removed_track_ids"]) == {"t1", "t2", "t3"}


def test_genre_boost_other_promotes_tracks(client: TestClient, tmp_db: str):
    """Boosting 'Other' genre (the only genre in v1) gives all tracks +0.3 boost.

    The relative ordering still matches the composite score; this test checks
    that the endpoint accepts and applies the boost without error, and that
    a track with a lower base score but matching the boosted genre still outranks
    a track with a slightly higher base score in the non-boosted genre (not
    applicable in v1 since all are 'Other', but the endpoint must not crash).
    """
    tracks = [
        _make_track("hi_score", energy=0.9, valence=0.9, danceability=0.9),
        _make_track("lo_score", energy=0.1, valence=0.1, danceability=0.1),
    ]
    _seed_audio_features(tmp_db, tracks)

    resp = client.post(
        "/refine",
        json={
            "playlist_id": PLAYLIST_ID,
            "track_ids": ["hi_score", "lo_score"],
            "constraints": {},
            "genre_config": {"boost": ["Other"]},
        },
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()

    # Both tracks present; hi_score still has a higher composite score
    assert data["ordered_track_ids"][0] == "hi_score"
    assert set(data["ordered_track_ids"]) == {"hi_score", "lo_score"}
    assert data["removed_track_ids"] == []


def test_empty_audio_features_returns_404(client: TestClient, tmp_db: str):
    """If no audio features exist for any track_id, return 404."""
    resp = client.post(
        "/refine",
        json={
            "playlist_id": PLAYLIST_ID,
            "track_ids": ["nonexistent_1", "nonexistent_2"],
            "constraints": {},
            "genre_config": {},
        },
    )
    assert resp.status_code == 404, resp.text


def test_refine_applied_event_logged(client: TestClient, tmp_db: str):
    """Calling /refine must append a refine_applied row to interaction_log."""
    tracks = [_make_track("tlog1"), _make_track("tlog2")]
    _seed_audio_features(tmp_db, tracks)

    resp = client.post(
        "/refine",
        json={
            "playlist_id": PLAYLIST_ID,
            "track_ids": ["tlog1", "tlog2"],
            "constraints": {"energy": {"min": 0.1}},
            "genre_config": {},
        },
    )
    assert resp.status_code == 200, resp.text

    conn = sqlite3.connect(tmp_db)
    rows = conn.execute(
        "SELECT * FROM interaction_log WHERE event_type = 'refine_applied'"
    ).fetchall()
    conn.close()

    assert len(rows) >= 1, "Expected at least one refine_applied row in interaction_log"
    # Verify playlist_id is captured
    row = rows[-1]
    event_data = json.loads(row[4])  # event_data column
    assert event_data.get("playlist_id") == PLAYLIST_ID
    assert "constraint_count" in event_data
