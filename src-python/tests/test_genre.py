"""
Tests for genre.py — Spotify genre string → Octave bucket classifier.

Acceptance criteria:
  AC-S3-08 — zero "Other" fallback for the 6 canonical bucket test inputs.
"""

import pytest
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from genre import classify_genre, get_subgenre_labels, GENRE_COLORS


# ---------------------------------------------------------------------------
# GENRE_COLORS smoke test
# ---------------------------------------------------------------------------


def test_genre_colors_has_all_buckets():
    """GENRE_COLORS must expose all 7 buckets."""
    expected = {"RnB", "Neo-Soul", "Hip-Hop", "Chill Pop", "Lo-Fi", "Nu-Jazz", "Other"}
    assert set(GENRE_COLORS.keys()) == expected


def test_genre_colors_are_valid_hex():
    for name, color in GENRE_COLORS.items():
        assert color.startswith("#"), f"{name} color {color!r} must start with #"
        assert len(color) == 7, f"{name} color {color!r} must be 7 chars (#RRGGBB)"


# ---------------------------------------------------------------------------
# RnB
# ---------------------------------------------------------------------------


def test_rnb_r_and_b():
    assert classify_genre(["r&b"]) == "RnB"


def test_rnb_soul():
    assert classify_genre(["soul"]) == "RnB"


def test_rnb_urban_contemporary():
    assert classify_genre(["urban contemporary"]) == "RnB"


def test_rnb_rhythm_and_blues():
    assert classify_genre(["rhythm and blues"]) == "RnB"


# ---------------------------------------------------------------------------
# Neo-Soul (AC-S3-08: must not fall back to "Other")
# ---------------------------------------------------------------------------


def test_neo_soul_neo_soul():
    assert classify_genre(["neo soul"]) == "Neo-Soul"


def test_neo_soul_alternative_rnb():
    assert classify_genre(["alternative r&b"]) == "Neo-Soul"


def test_neo_soul_indie_soul():
    assert classify_genre(["indie soul"]) == "Neo-Soul"


def test_neo_soul_bedroom_soul():
    assert classify_genre(["bedroom soul"]) == "Neo-Soul"


# ---------------------------------------------------------------------------
# Hip-Hop
# ---------------------------------------------------------------------------


def test_hiphop_rap():
    assert classify_genre(["rap"]) == "Hip-Hop"


def test_hiphop_trap():
    assert classify_genre(["trap"]) == "Hip-Hop"


def test_hiphop_drill():
    assert classify_genre(["drill"]) == "Hip-Hop"


def test_hiphop_boom_bap():
    assert classify_genre(["boom bap"]) == "Hip-Hop"


# ---------------------------------------------------------------------------
# Chill Pop
# ---------------------------------------------------------------------------


def test_chill_pop_indie_pop():
    assert classify_genre(["indie pop"]) == "Chill Pop"


def test_chill_pop_dream_pop():
    assert classify_genre(["dream pop"]) == "Chill Pop"


def test_chill_pop_bedroom_pop():
    assert classify_genre(["bedroom pop"]) == "Chill Pop"


# ---------------------------------------------------------------------------
# Lo-Fi
# ---------------------------------------------------------------------------


def test_lofi_lofi():
    assert classify_genre(["lo-fi"]) == "Lo-Fi"


def test_lofi_chillhop():
    assert classify_genre(["chillhop"]) == "Lo-Fi"


def test_lofi_study_beats():
    assert classify_genre(["study beats"]) == "Lo-Fi"


# ---------------------------------------------------------------------------
# Nu-Jazz
# ---------------------------------------------------------------------------


def test_nu_jazz_jazz():
    assert classify_genre(["jazz"]) == "Nu-Jazz"


def test_nu_jazz_nu_jazz():
    assert classify_genre(["nu jazz"]) == "Nu-Jazz"


def test_nu_jazz_bossa_nova():
    assert classify_genre(["bossa nova"]) == "Nu-Jazz"


# ---------------------------------------------------------------------------
# Other (fallback)
# ---------------------------------------------------------------------------


def test_other_unknown_genre():
    assert classify_genre(["progressive metal"]) == "Other"


def test_other_empty_list():
    assert classify_genre([]) == "Other"


# ---------------------------------------------------------------------------
# Case-insensitivity
# ---------------------------------------------------------------------------


def test_case_insensitive_upper():
    assert classify_genre(["NEO SOUL"]) == "Neo-Soul"


def test_case_insensitive_mixed():
    assert classify_genre(["Hip-Hop"]) == "Hip-Hop"


def test_case_insensitive_rap_upper():
    assert classify_genre(["RAP"]) == "Hip-Hop"


# ---------------------------------------------------------------------------
# Multi-genre input → correct single bucket
# ---------------------------------------------------------------------------


def test_multi_genre_picks_most_specific():
    """neo soul is more specific than soul, so Neo-Soul should win."""
    result = classify_genre(["soul", "neo soul", "quiet storm"])
    assert result == "Neo-Soul"


def test_multi_genre_hip_hop_wins_over_other():
    result = classify_genre(["unknown genre", "trap"])
    assert result == "Hip-Hop"


def test_multi_genre_all_unknown_returns_other():
    result = classify_genre(["progressive metal", "death core", "noise"])
    assert result == "Other"


# ---------------------------------------------------------------------------
# get_subgenre_labels
# ---------------------------------------------------------------------------


def test_subgenre_labels_returns_known_genres():
    labels = get_subgenre_labels(["neo soul", "quiet storm", "urban contemporary"])
    # "quiet storm" has no keyword match, should be excluded
    assert "quiet storm" not in labels
    assert len(labels) <= 3


def test_subgenre_labels_limits_to_3():
    genres = ["trap", "drill", "rap", "boom bap", "hip hop"]
    labels = get_subgenre_labels(genres)
    assert len(labels) <= 3


def test_subgenre_labels_empty_input():
    assert get_subgenre_labels([]) == []


def test_subgenre_labels_all_unknown():
    assert get_subgenre_labels(["death metal", "grindcore"]) == []
