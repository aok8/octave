"""
similarity.py — Cosine similarity engine over audio feature vectors.

Operates on cached rows from the ``audio_features`` SQLite table.  No network
calls are made here — this module is pure computation + DB reads.

Features used (6-dimensional vector):
    energy, valence, danceability,
    tempo (normalized: value / 200),
    acousticness, instrumentalness
"""

import math
import random
import sqlite3
from typing import Any, Dict, List

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_FEATURE_NAMES: List[str] = [
    "energy",
    "valence",
    "danceability",
    "tempo",          # normalized inside build_vector
    "acousticness",
    "instrumentalness",
]

_DEFAULT_FALLBACK = 0.5   # used for None values (except tempo, see below)
_DEFAULT_TEMPO = 120.0    # fallback tempo before normalization
_TEMPO_SCALE = 200.0      # divisor to bring tempo into [0, 1] range


# ---------------------------------------------------------------------------
# Core vector utilities
# ---------------------------------------------------------------------------


def build_vector(row: Dict[str, Any]) -> List[float]:
    """Extract a 6-feature vector from a DB row (or any dict).

    None values fall back to 0.5.  Tempo is special: its fallback is 120.0
    before dividing by 200, yielding 0.6.

    Args:
        row: Dict containing audio feature values (may come from sqlite3.Row
             converted with ``dict(row)`` or an already-plain dict).

    Returns:
        List[float] of length 6, one value per feature in ``_FEATURE_NAMES``.
    """
    vec: List[float] = []
    for name in _FEATURE_NAMES:
        raw = row.get(name)
        if name == "tempo":
            tempo_val = float(raw) if raw is not None else _DEFAULT_TEMPO
            vec.append(tempo_val / _TEMPO_SCALE)
        else:
            vec.append(float(raw) if raw is not None else _DEFAULT_FALLBACK)
    return vec


def cosine_similarity(a: List[float], b: List[float]) -> float:
    """Compute cosine similarity between two equal-length vectors.

    Returns 0.0 if either vector is all-zeros (avoids division by zero).

    Args:
        a: First vector.
        b: Second vector (must have the same length as ``a``).

    Returns:
        Float in [0.0, 1.0].
    """
    dot = sum(x * y for x, y in zip(a, b))
    mag_a = math.sqrt(sum(x * x for x in a))
    mag_b = math.sqrt(sum(y * y for y in b))
    if mag_a == 0.0 or mag_b == 0.0:
        return 0.0
    return dot / (mag_a * mag_b)


def matching_features(
    seed_vec: List[float],
    candidate_vec: List[float],
    threshold: float = 0.15,
) -> List[str]:
    """Return names of features where seed and candidate are within ``threshold``.

    Args:
        seed_vec: Reference vector (length 6).
        candidate_vec: Candidate vector (length 6).
        threshold: Maximum absolute difference to count as a "match".

    Returns:
        List of feature name strings, e.g. ``["energy", "valence"]``.
    """
    result: List[str] = []
    for name, sv, cv in zip(_FEATURE_NAMES, seed_vec, candidate_vec):
        if abs(sv - cv) < threshold:
            result.append(name)
    return result


# ---------------------------------------------------------------------------
# DB-backed similarity search
# ---------------------------------------------------------------------------


def find_similar_tracks(
    seed_track_id: str,
    conn: sqlite3.Connection,
    limit: int = 20,
) -> List[Dict[str, Any]]:
    """Find tracks most similar to ``seed_track_id`` by cosine similarity.

    Queries all rows in ``audio_features`` (excluding the seed), computes
    cosine similarity to the seed vector, sorts descending, and returns the
    top ``limit`` entries.

    Args:
        seed_track_id: Spotify track ID to use as the seed.
        conn: Open SQLite connection with ``row_factory = sqlite3.Row``
              (or compatible).
        limit: Maximum number of results to return.

    Returns:
        List of dicts, each with keys:
            - ``track_id`` (str)
            - ``score`` (float, rounded to 2 decimal places)
            - ``matching_features`` (list[str])
        Sorted by ``score`` descending.  Returns ``[]`` if the seed track has
        no audio features row.
    """
    # Look up the seed row
    cursor = conn.execute(
        "SELECT * FROM audio_features WHERE track_id = ?",
        (seed_track_id,),
    )
    seed_row = cursor.fetchone()
    if seed_row is None:
        return []

    seed_dict = dict(seed_row)
    seed_vec = build_vector(seed_dict)

    # Load all other rows
    cursor = conn.execute(
        "SELECT * FROM audio_features WHERE track_id != ?",
        (seed_track_id,),
    )
    rows = cursor.fetchall()

    scored: List[Dict[str, Any]] = []
    for row in rows:
        row_dict = dict(row)
        cand_vec = build_vector(row_dict)
        score = cosine_similarity(seed_vec, cand_vec)
        mf = matching_features(seed_vec, cand_vec)
        scored.append(
            {
                "track_id": row_dict["track_id"],
                "score": round(score, 2),
                "matching_features": mf,
            }
        )

    scored.sort(key=lambda x: x["score"], reverse=True)
    return scored[:limit]
