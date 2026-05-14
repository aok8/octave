"""
ranker.py — Re-ranking engine for Octave playlist tracks.

Public API
----------
rank_tracks(track_pool, constraints, genre_config) -> dict
    Filter and re-rank a pool of tracks by audio-feature constraints,
    genre exclusions/boosts, and a composite score.
"""

from __future__ import annotations


def rank_tracks(
    track_pool: list[dict],
    constraints: dict,
    genre_config: dict,
) -> dict:
    """Filter and rank a pool of tracks by constraints and genre config.

    Parameters
    ----------
    track_pool:
        List of track dicts.  Each must have keys:
        ``track_id``, ``energy``, ``tempo``, ``valence``, ``danceability``,
        ``acousticness``, ``instrumentalness``, ``popularity``, ``genre``.
        Numeric features may be ``None``; they are treated as 0 for scoring.

    constraints:
        Mapping of feature name → ``{"min": float, "max": float}``.
        Only keys present in the dict are applied.  Example::

            {"energy": {"min": 0.5, "max": 1.0}, "tempo": {"min": 80, "max": 160}}

    genre_config:
        Mapping with up to three optional keys:

        - ``"include"`` — list of genre bucket names to keep exclusively.
          If empty or absent, all genres are included.
        - ``"exclude"`` — list of genre bucket names to remove.
        - ``"boost"``   — list of genre bucket names whose tracks get a
          ``+0.3`` bonus added to their composite score.

    Returns
    -------
    dict
        ``{"ordered_track_ids": [...], "removed_track_ids": [...]}``.

        * ``ordered_track_ids``: all tracks that passed every filter,
          sorted by composite score descending.
        * ``removed_track_ids``: tracks filtered out by constraints or
          genre exclusion.

    Scoring
    -------
    ``composite = mean(energy, valence, danceability) + boost``

    where ``boost`` is ``0.3`` for tracks in ``genre_config["boost"]``
    and ``0`` otherwise.  Missing feature values are treated as ``0.0``.
    """
    if not track_pool:
        return {"ordered_track_ids": [], "removed_track_ids": []}

    # Normalise genre config — default to empty lists
    include_genres: list[str] = genre_config.get("include") or []
    exclude_genres: list[str] = genre_config.get("exclude") or []
    boost_genres: list[str] = genre_config.get("boost") or []

    ordered: list[dict] = []
    removed_ids: list[str] = []

    for track in track_pool:
        track_id = track.get("track_id", "")
        genre = track.get("genre", "Other") or "Other"

        # --- Genre exclusion filter ---
        if genre in exclude_genres:
            removed_ids.append(track_id)
            continue

        # --- Genre include filter (if specified) ---
        if include_genres and genre not in include_genres:
            removed_ids.append(track_id)
            continue

        # --- Audio-feature constraints ---
        excluded_by_constraint = False
        for feature, bounds in constraints.items():
            value = track.get(feature)
            if value is None:
                continue  # Skip constraint check for missing values
            lo = bounds.get("min")
            hi = bounds.get("max")
            if lo is not None and value < lo:
                excluded_by_constraint = True
                break
            if hi is not None and value > hi:
                excluded_by_constraint = True
                break

        if excluded_by_constraint:
            removed_ids.append(track_id)
            continue

        # --- Composite score ---
        energy = float(track.get("energy") or 0.0)
        valence = float(track.get("valence") or 0.0)
        danceability = float(track.get("danceability") or 0.0)
        base_score = (energy + valence + danceability) / 3.0
        boost = 0.3 if genre in boost_genres else 0.0
        score = base_score + boost

        ordered.append({"track_id": track_id, "score": score})

    # Sort by score descending
    ordered.sort(key=lambda x: x["score"], reverse=True)

    return {
        "ordered_track_ids": [t["track_id"] for t in ordered],
        "removed_track_ids": removed_ids,
    }
