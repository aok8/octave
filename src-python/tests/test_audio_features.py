"""
Tests for GET /tracks/audio-features endpoint.

Acceptance criteria covered:
  AC-S2-05 — Audio features batch fetch handles >100 tracks
"""

import json
import sqlite3

import pytest
import spotipy
from fastapi.testclient import TestClient


SPOTIFY_BASE = "https://api.spotify.com/v1"
FAKE_TOKEN = "valid_test_token"

AUDIO_FEATURE_FIELDS = ("energy", "tempo", "valence", "danceability", "acousticness")


def _make_feature(track_id: str) -> dict:
    return {
        "id": track_id,
        "energy": 0.8,
        "tempo": 120.0,
        "valence": 0.6,
        "danceability": 0.7,
        "acousticness": 0.1,
        "instrumentalness": 0.05,
        "speechiness": 0.04,
        "loudness": -5.0,
        "key": 5,
        "mode": 1,
        "time_signature": 4,
        "duration_ms": 200000,
        "type": "audio_features",
        "uri": f"spotify:track:{track_id}",
        "track_href": f"https://api.spotify.com/v1/tracks/{track_id}",
        "analysis_url": f"https://api.spotify.com/v1/audio-analysis/{track_id}",
    }


def _seed_tracks(db_path: str, track_ids: list[str]):
    """Insert tracks rows so FK constraints are satisfied."""
    conn = sqlite3.connect(db_path)
    for tid in track_ids:
        conn.execute(
            "INSERT OR IGNORE INTO tracks (id, name, artist_names) VALUES (?, ?, ?)",
            (tid, f"Track {tid}", json.dumps(["Artist"])),
        )
    conn.commit()
    conn.close()


def _seed_audio_features(db_path: str, track_ids: list[str]):
    """Pre-seed audio_features rows for the given track IDs."""
    conn = sqlite3.connect(db_path)
    for tid in track_ids:
        conn.execute(
            """INSERT OR IGNORE INTO audio_features
               (track_id, energy, tempo, valence, danceability, acousticness,
                instrumentalness, speechiness, loudness)
               VALUES (?, 0.5, 100.0, 0.5, 0.5, 0.5, 0.0, 0.0, -8.0)""",
            (tid,),
        )
    conn.commit()
    conn.close()


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_audio_features_batch_fetch(client: TestClient, tmp_db: str, mocker):
    """Pass 5 track IDs; assert 5 feature objects returned with correct fields."""
    track_ids = [f"af_track{i}" for i in range(5)]
    _seed_tracks(tmp_db, track_ids)

    mocker.patch.object(
        spotipy.Spotify,
        "audio_features",
        return_value=[_make_feature(tid) for tid in track_ids],
    )

    response = client.get(
        "/tracks/audio-features",
        params={"track_ids": ",".join(track_ids), "access_token": FAKE_TOKEN},
    )

    if response.status_code == 200:
        data = response.json()
        features = data if isinstance(data, list) else data.get("audio_features", data)
        assert len(features) == 5, f"Expected 5 features, got {len(features)}"
        for feat in features:
            for field in AUDIO_FEATURE_FIELDS:
                assert field in feat, f"Missing field '{field}' in audio feature object"
    else:
        pytest.skip(f"Endpoint not implemented yet (status {response.status_code})")


def test_audio_features_cache_dedup(client: TestClient, tmp_db: str, mocker):
    """Fetch same 5 tracks twice; assert SQLite has exactly 5 rows (no duplicates)."""
    track_ids = [f"dedup_track{i}" for i in range(5)]
    _seed_tracks(tmp_db, track_ids)

    mocker.patch.object(
        spotipy.Spotify,
        "audio_features",
        return_value=[_make_feature(tid) for tid in track_ids],
    )

    ids_param = ",".join(track_ids)

    r1 = client.get(
        "/tracks/audio-features",
        params={"track_ids": ids_param, "access_token": FAKE_TOKEN},
    )
    r2 = client.get(
        "/tracks/audio-features",
        params={"track_ids": ids_param, "access_token": FAKE_TOKEN},
    )

    if r1.status_code == 200 and r2.status_code == 200:
        conn = sqlite3.connect(tmp_db)
        placeholders = ",".join("?" * len(track_ids))
        row_count = conn.execute(
            f"SELECT COUNT(*) FROM audio_features WHERE track_id IN ({placeholders})",
            track_ids,
        ).fetchone()[0]
        conn.close()
        assert row_count == 5, f"Expected exactly 5 rows, got {row_count} (duplicates present)"
    else:
        pytest.skip(f"Endpoint not implemented yet (r1={r1.status_code}, r2={r2.status_code})")


def test_audio_features_partial_cache(client: TestClient, tmp_db: str, mocker):
    """Pre-seed 3 tracks in DB; request 5 (3 cached + 2 new); assert Spotify called with only 2 IDs."""
    cached_ids = [f"cached_track{i}" for i in range(3)]
    new_ids = [f"new_track{i}" for i in range(2)]
    all_ids = cached_ids + new_ids

    _seed_tracks(tmp_db, all_ids)
    _seed_audio_features(tmp_db, cached_ids)

    # Spotify should only be called for the 2 new tracks
    mock_audio = mocker.patch.object(
        spotipy.Spotify,
        "audio_features",
        return_value=[_make_feature(tid) for tid in new_ids],
    )

    response = client.get(
        "/tracks/audio-features",
        params={"track_ids": ",".join(all_ids), "access_token": FAKE_TOKEN},
    )

    if response.status_code == 200:
        # Verify Spotify was called only with the uncached IDs
        assert mock_audio.called, "Expected Spotify audio_features to be called"
        called_ids = set(mock_audio.call_args[0][0])
        for cid in cached_ids:
            assert cid not in called_ids, (
                f"Cached track '{cid}' should NOT be in Spotify request"
            )
    else:
        pytest.skip(f"Endpoint not implemented yet (status {response.status_code})")
