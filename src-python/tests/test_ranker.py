"""
Tests for ranker.py — track re-ranking engine.
"""

import sys
import os

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ranker import rank_tracks


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_track(
    track_id: str,
    energy: float = 0.5,
    valence: float = 0.5,
    danceability: float = 0.5,
    tempo: float = 120.0,
    acousticness: float = 0.1,
    instrumentalness: float = 0.0,
    popularity: int = 50,
    genre: str = "Other",
) -> dict:
    return {
        "track_id": track_id,
        "energy": energy,
        "valence": valence,
        "danceability": danceability,
        "tempo": tempo,
        "acousticness": acousticness,
        "instrumentalness": instrumentalness,
        "popularity": popularity,
        "genre": genre,
    }


POOL = [
    _make_track("t1", energy=0.9, valence=0.8, danceability=0.7, genre="Hip-Hop"),
    _make_track("t2", energy=0.3, valence=0.4, danceability=0.2, genre="Lo-Fi"),
    _make_track("t3", energy=0.6, valence=0.6, danceability=0.6, genre="RnB"),
    _make_track("t4", energy=0.1, valence=0.1, danceability=0.1, genre="Nu-Jazz"),
]


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_no_constraints_all_tracks_returned():
    """With empty constraints and genre config, all tracks are returned."""
    result = rank_tracks(POOL, constraints={}, genre_config={})
    assert set(result["ordered_track_ids"]) == {"t1", "t2", "t3", "t4"}
    assert result["removed_track_ids"] == []


def test_no_constraints_sorted_by_score():
    """Tracks are sorted highest composite score first."""
    result = rank_tracks(POOL, constraints={}, genre_config={})
    ids = result["ordered_track_ids"]
    # t1 has highest mean(0.9,0.8,0.7)=0.8 → must be first
    assert ids[0] == "t1"
    # t4 has lowest mean(0.1,0.1,0.1)=0.1 → must be last
    assert ids[-1] == "t4"


def test_energy_max_filter_excludes_high_energy():
    """Tracks above energy max are moved to removed_track_ids."""
    result = rank_tracks(
        POOL,
        constraints={"energy": {"max": 0.5}},
        genre_config={},
    )
    # t1 (energy=0.9) and t3 (energy=0.6) should be removed
    assert "t1" in result["removed_track_ids"]
    assert "t3" in result["removed_track_ids"]
    assert "t1" not in result["ordered_track_ids"]
    assert "t3" not in result["ordered_track_ids"]


def test_energy_min_filter_excludes_low_energy():
    """Tracks below energy min are moved to removed_track_ids."""
    result = rank_tracks(
        POOL,
        constraints={"energy": {"min": 0.5}},
        genre_config={},
    )
    # t2 (0.3) and t4 (0.1) are below 0.5
    assert "t2" in result["removed_track_ids"]
    assert "t4" in result["removed_track_ids"]


def test_genre_exclude_removes_genre():
    """Tracks with excluded genre end up in removed_track_ids."""
    result = rank_tracks(
        POOL,
        constraints={},
        genre_config={"exclude": ["Lo-Fi"]},
    )
    assert "t2" in result["removed_track_ids"]
    assert "t2" not in result["ordered_track_ids"]
    # Other tracks are unaffected
    assert "t1" in result["ordered_track_ids"]


def test_genre_boost_puts_boosted_tracks_first():
    """Boosted genre tracks should appear before non-boosted tracks with lower base score."""
    # t2 (Lo-Fi): base = mean(0.3, 0.4, 0.2) = 0.3 + 0.3 boost = 0.6
    # t3 (RnB):   base = mean(0.6, 0.6, 0.6) = 0.6 + 0.0 boost = 0.6
    # t4 (Nu-Jazz): base = mean(0.1, 0.1, 0.1) = 0.1 + 0.3 boost = 0.4
    result = rank_tracks(
        POOL,
        constraints={},
        genre_config={"boost": ["Lo-Fi"]},
    )
    ids = result["ordered_track_ids"]
    # t1 (0.8) still first; t2 (0.6) should be near top ahead of t4 (0.4)
    t2_pos = ids.index("t2")
    t4_pos = ids.index("t4")
    assert t2_pos < t4_pos, f"t2 (boosted) should rank above t4; order={ids}"


def test_empty_pool_returns_empty_lists():
    """Empty track pool returns empty ordered and removed lists."""
    result = rank_tracks([], constraints={}, genre_config={})
    assert result == {"ordered_track_ids": [], "removed_track_ids": []}


def test_multiple_constraints_combined():
    """Multiple constraints are ANDed: a track must satisfy all of them."""
    # Keep only tracks with energy >= 0.5 AND valence >= 0.5
    result = rank_tracks(
        POOL,
        constraints={"energy": {"min": 0.5}, "valence": {"min": 0.5}},
        genre_config={},
    )
    ordered = result["ordered_track_ids"]
    removed = result["removed_track_ids"]
    # t1: energy=0.9 ✓, valence=0.8 ✓ → kept
    # t3: energy=0.6 ✓, valence=0.6 ✓ → kept
    # t2: energy=0.3 ✗ → removed
    # t4: energy=0.1 ✗ → removed
    assert "t1" in ordered
    assert "t3" in ordered
    assert "t2" in removed
    assert "t4" in removed


def test_genre_exclude_and_constraint_combined():
    """Genre exclusion and feature constraints both reduce the pool independently."""
    result = rank_tracks(
        POOL,
        constraints={"energy": {"max": 0.7}},
        genre_config={"exclude": ["RnB"]},
    )
    ordered = result["ordered_track_ids"]
    removed = result["removed_track_ids"]
    # t1: energy=0.9 > 0.7 → removed by constraint
    # t3: RnB → removed by genre exclusion
    # t2: energy=0.3 ≤ 0.7, Lo-Fi not excluded → kept
    # t4: energy=0.1 ≤ 0.7, Nu-Jazz not excluded → kept
    assert "t1" in removed
    assert "t3" in removed
    assert "t2" in ordered
    assert "t4" in ordered
