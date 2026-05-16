"""
Tests for similarity.py — cosine similarity engine over audio feature vectors.

Covers:
- cosine_similarity: identical, orthogonal, zero-vector edge cases
- build_vector: None fallback, tempo normalization
- matching_features: all match, none match
- find_similar_tracks: returns results sorted by score descending
"""

import math
import sqlite3
import tempfile
import time
import os

import pytest

from similarity import (
    build_vector,
    cosine_similarity,
    find_similar_tracks,
    matching_features,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_conn_with_features(rows: list[dict]) -> sqlite3.Connection:
    """Create an in-memory SQLite DB with the audio_features table populated."""
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.execute(
        """
        CREATE TABLE audio_features (
            track_id TEXT PRIMARY KEY,
            energy REAL,
            tempo REAL,
            valence REAL,
            danceability REAL,
            acousticness REAL,
            instrumentalness REAL,
            speechiness REAL,
            loudness REAL,
            key INTEGER,
            mode INTEGER,
            time_signature INTEGER,
            cached_at INTEGER
        )
        """
    )
    for row in rows:
        conn.execute(
            """
            INSERT INTO audio_features
                (track_id, energy, tempo, valence, danceability, acousticness,
                 instrumentalness, speechiness, loudness, cached_at)
            VALUES
                (:track_id, :energy, :tempo, :valence, :danceability,
                 :acousticness, :instrumentalness, :speechiness, :loudness, :cached_at)
            """,
            {
                "track_id": row["track_id"],
                "energy": row.get("energy"),
                "tempo": row.get("tempo"),
                "valence": row.get("valence"),
                "danceability": row.get("danceability"),
                "acousticness": row.get("acousticness"),
                "instrumentalness": row.get("instrumentalness"),
                "speechiness": row.get("speechiness", 0.05),
                "loudness": row.get("loudness", -5.0),
                "cached_at": int(time.time()),
            },
        )
    conn.commit()
    return conn


# ---------------------------------------------------------------------------
# cosine_similarity tests
# ---------------------------------------------------------------------------


def test_cosine_similarity_identical_vectors():
    """Identical non-zero vectors must yield similarity of exactly 1.0."""
    v = [0.8, 0.6, 0.7, 0.5, 0.3, 0.1]
    result = cosine_similarity(v, v)
    assert abs(result - 1.0) < 1e-9, f"Expected 1.0, got {result}"


def test_cosine_similarity_orthogonal_vectors():
    """Perpendicular vectors must yield similarity of 0.0."""
    a = [1.0, 0.0, 0.0, 0.0, 0.0, 0.0]
    b = [0.0, 1.0, 0.0, 0.0, 0.0, 0.0]
    result = cosine_similarity(a, b)
    assert abs(result - 0.0) < 1e-9, f"Expected 0.0, got {result}"


def test_cosine_similarity_zero_vector():
    """All-zero vector must return 0.0 (avoids ZeroDivisionError)."""
    zero = [0.0, 0.0, 0.0, 0.0, 0.0, 0.0]
    other = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5]
    assert cosine_similarity(zero, other) == 0.0
    assert cosine_similarity(other, zero) == 0.0
    assert cosine_similarity(zero, zero) == 0.0


def test_cosine_similarity_known_value():
    """Verify the formula against a hand-computed example."""
    a = [1.0, 0.0]
    b = [1.0, 1.0]
    # dot = 1, |a|=1, |b|=sqrt(2)  → cos = 1/sqrt(2) ≈ 0.7071
    expected = 1.0 / math.sqrt(2.0)
    result = cosine_similarity(a, b)
    assert abs(result - expected) < 1e-9, f"Expected {expected}, got {result}"


# ---------------------------------------------------------------------------
# build_vector tests
# ---------------------------------------------------------------------------


def test_build_vector_handles_none():
    """None values (except tempo) must fall back to 0.5."""
    row = {
        "energy": None,
        "valence": None,
        "danceability": None,
        "tempo": None,
        "acousticness": None,
        "instrumentalness": None,
    }
    vec = build_vector(row)
    # energy, valence, danceability, acousticness, instrumentalness → 0.5
    assert vec[0] == 0.5, f"energy fallback: {vec[0]}"
    assert vec[1] == 0.5, f"valence fallback: {vec[1]}"
    assert vec[2] == 0.5, f"danceability fallback: {vec[2]}"
    assert vec[4] == 0.5, f"acousticness fallback: {vec[4]}"
    assert vec[5] == 0.5, f"instrumentalness fallback: {vec[5]}"
    # tempo fallback: 120.0 / 200.0 = 0.6
    assert abs(vec[3] - 0.6) < 1e-9, f"tempo fallback: {vec[3]}"


def test_build_vector_normalizes_tempo():
    """tempo=120 must produce 0.6 in the vector (120 / 200)."""
    row = {
        "energy": 0.8,
        "valence": 0.6,
        "danceability": 0.7,
        "tempo": 120.0,
        "acousticness": 0.2,
        "instrumentalness": 0.0,
    }
    vec = build_vector(row)
    assert abs(vec[3] - 0.6) < 1e-9, f"Expected tempo 0.6, got {vec[3]}"


def test_build_vector_length():
    """build_vector must always return exactly 6 elements."""
    row = {
        "energy": 0.5,
        "valence": 0.5,
        "danceability": 0.5,
        "tempo": 100.0,
        "acousticness": 0.3,
        "instrumentalness": 0.1,
    }
    vec = build_vector(row)
    assert len(vec) == 6, f"Expected 6 elements, got {len(vec)}"


# ---------------------------------------------------------------------------
# matching_features tests
# ---------------------------------------------------------------------------


def test_matching_features_all_match():
    """Identical vectors must list all 6 feature names."""
    v = [0.8, 0.6, 0.7, 0.5, 0.3, 0.1]
    result = matching_features(v, v, threshold=0.15)
    assert set(result) == {"energy", "valence", "danceability", "tempo", "acousticness", "instrumentalness"}, (
        f"Expected all 6 features, got: {result}"
    )


def test_matching_features_none_match():
    """Vectors far apart (diff > threshold) must return empty list."""
    seed = [1.0, 1.0, 1.0, 1.0, 1.0, 1.0]
    candidate = [0.0, 0.0, 0.0, 0.0, 0.0, 0.0]
    result = matching_features(seed, candidate, threshold=0.15)
    assert result == [], f"Expected no matching features, got: {result}"


def test_matching_features_partial_match():
    """Vectors matching on some features must return only those names."""
    # energy matches (diff = 0.05 < 0.15), valence doesn't (diff = 0.5 > 0.15)
    seed =      [0.8, 0.9, 0.5, 0.5, 0.5, 0.5]
    candidate = [0.85, 0.4, 0.5, 0.5, 0.5, 0.5]
    result = matching_features(seed, candidate, threshold=0.15)
    assert "energy" in result, "energy should match"
    assert "valence" not in result, "valence should not match"


# ---------------------------------------------------------------------------
# find_similar_tracks tests
# ---------------------------------------------------------------------------


def test_find_similar_tracks_returns_sorted():
    """Three tracks with known features: returned order must be by similarity descending."""
    # seed:  energy=0.8, valence=0.8, danceability=0.8, tempo=160 (0.8), acousticness=0.2, instrumentalness=0.1
    # close: same as seed → highest similarity
    # mid:   moderate distance
    # far:   opposite → lowest similarity
    seed_features = dict(
        track_id="seed",
        energy=0.8, valence=0.8, danceability=0.8, tempo=160.0, acousticness=0.2, instrumentalness=0.1,
    )
    close_features = dict(
        track_id="close",
        energy=0.75, valence=0.78, danceability=0.82, tempo=155.0, acousticness=0.22, instrumentalness=0.12,
    )
    mid_features = dict(
        track_id="mid",
        energy=0.5, valence=0.5, danceability=0.5, tempo=100.0, acousticness=0.5, instrumentalness=0.5,
    )
    far_features = dict(
        track_id="far",
        energy=0.1, valence=0.1, danceability=0.1, tempo=40.0, acousticness=0.9, instrumentalness=0.9,
    )

    conn = _make_conn_with_features([seed_features, close_features, mid_features, far_features])
    results = find_similar_tracks("seed", conn, limit=10)

    assert len(results) == 3, f"Expected 3 results (excluding seed), got {len(results)}"
    ids = [r["track_id"] for r in results]
    scores = [r["score"] for r in results]

    # Sorted descending
    assert scores == sorted(scores, reverse=True), f"Results not sorted by score: {scores}"
    # Close track should be ranked first
    assert ids[0] == "close", f"Expected 'close' first, got: {ids}"
    # Far track should be ranked last
    assert ids[-1] == "far", f"Expected 'far' last, got: {ids}"


def test_find_similar_tracks_unknown_seed_returns_empty():
    """When the seed track has no features row, must return empty list."""
    conn = _make_conn_with_features([
        dict(track_id="other", energy=0.5, valence=0.5, danceability=0.5,
             tempo=120.0, acousticness=0.3, instrumentalness=0.0),
    ])
    results = find_similar_tracks("nonexistent_seed", conn, limit=10)
    assert results == [], f"Expected [], got {results}"


def test_find_similar_tracks_excludes_seed():
    """The seed track itself must never appear in results."""
    rows = [
        dict(track_id="seed", energy=0.8, valence=0.7, danceability=0.6,
             tempo=120.0, acousticness=0.2, instrumentalness=0.0),
        dict(track_id="other", energy=0.75, valence=0.65, danceability=0.55,
             tempo=115.0, acousticness=0.25, instrumentalness=0.05),
    ]
    conn = _make_conn_with_features(rows)
    results = find_similar_tracks("seed", conn, limit=10)
    ids = [r["track_id"] for r in results]
    assert "seed" not in ids, f"Seed track should not be in results: {ids}"


def test_find_similar_tracks_score_in_range():
    """All returned scores must be floats in [0.0, 1.0]."""
    rows = [
        dict(track_id="s", energy=0.8, valence=0.7, danceability=0.6,
             tempo=120.0, acousticness=0.2, instrumentalness=0.0),
        dict(track_id="a", energy=0.7, valence=0.6, danceability=0.5,
             tempo=110.0, acousticness=0.3, instrumentalness=0.1),
        dict(track_id="b", energy=0.4, valence=0.3, danceability=0.3,
             tempo=80.0, acousticness=0.6, instrumentalness=0.5),
    ]
    conn = _make_conn_with_features(rows)
    results = find_similar_tracks("s", conn, limit=5)
    for r in results:
        assert 0.0 <= r["score"] <= 1.0, f"Score out of range: {r['score']}"


def test_find_similar_tracks_matching_features_present():
    """Each result dict must contain a 'matching_features' list."""
    rows = [
        dict(track_id="s", energy=0.8, valence=0.7, danceability=0.6,
             tempo=120.0, acousticness=0.2, instrumentalness=0.0),
        dict(track_id="a", energy=0.78, valence=0.68, danceability=0.58,
             tempo=118.0, acousticness=0.22, instrumentalness=0.02),
    ]
    conn = _make_conn_with_features(rows)
    results = find_similar_tracks("s", conn, limit=5)
    assert len(results) == 1
    assert "matching_features" in results[0]
    assert isinstance(results[0]["matching_features"], list)
