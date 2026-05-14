"""
routers/refine.py — Playlist refinement endpoint.

POST /refine
    Filter and re-rank a pool of tracks by audio-feature constraints,
    genre exclusions/boosts, and a composite score.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from db import get_cached_features, get_cached_tracks, get_db, log_interaction
from ranker import rank_tracks

router = APIRouter()


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------


class FeatureBounds(BaseModel):
    min: Optional[float] = None
    max: Optional[float] = None


class GenreConfig(BaseModel):
    exclude: List[str] = []
    boost: List[str] = []
    include: List[str] = []


class RefineRequest(BaseModel):
    playlist_id: str
    track_ids: List[str]
    constraints: Dict[str, FeatureBounds] = {}
    genre_config: GenreConfig = GenreConfig()


# ---------------------------------------------------------------------------
# Route
# ---------------------------------------------------------------------------


@router.post("")
def refine_playlist(body: RefineRequest):
    """Filter and re-rank the given track pool.

    Steps
    -----
    1. Fetch audio features and track rows (for stored genres) from SQLite.
    2. Build the track pool, passing stored genres so ``rank_tracks`` can
       classify each track into the correct genre bucket.
    3. Delegate to ``rank_tracks()`` from ``ranker.py``.
    4. Log a ``refine_applied`` event with the playlist_id and active
       constraint count.
    5. Return ``{"ordered_track_ids": [...], "removed_track_ids": [...]}``.
    """
    conn = get_db()
    try:
        # --- Fetch audio features ---
        features_by_id = get_cached_features(conn, body.track_ids)

        if not features_by_id:
            raise HTTPException(
                status_code=404,
                detail=f"No audio features found for any of the provided track IDs",
            )

        # --- Fetch stored genres from tracks table ---
        tracks_rows = get_cached_tracks(conn, body.playlist_id)
        genres_by_id: Dict[str, Any] = {row["id"]: row.get("genres") for row in tracks_rows}

        # --- Build track pool ---
        track_pool: List[Dict[str, Any]] = []
        for track_id in body.track_ids:
            feats = features_by_id.get(track_id)
            if feats is None:
                # Skip tracks with no features — they will not appear in either list.
                continue
            track_pool.append(
                {
                    "track_id": track_id,
                    "energy": feats.get("energy"),
                    "tempo": feats.get("tempo"),
                    "valence": feats.get("valence"),
                    "danceability": feats.get("danceability"),
                    "acousticness": feats.get("acousticness"),
                    "instrumentalness": feats.get("instrumentalness"),
                    "popularity": feats.get("popularity"),
                    # Pass raw genres JSON string; ranker.py will classify via classify_genre
                    "genres": genres_by_id.get(track_id),
                }
            )

        # --- Convert constraints from Pydantic models to plain dicts ---
        raw_constraints: Dict[str, Dict[str, float]] = {}
        for feature, bounds in body.constraints.items():
            entry: Dict[str, float] = {}
            if bounds.min is not None:
                entry["min"] = bounds.min
            if bounds.max is not None:
                entry["max"] = bounds.max
            if entry:
                raw_constraints[feature] = entry

        raw_genre_config: Dict[str, List[str]] = {
            "exclude": body.genre_config.exclude,
            "boost": body.genre_config.boost,
            "include": body.genre_config.include,
        }

        # --- Rank ---
        result = rank_tracks(track_pool, raw_constraints, raw_genre_config)

        # --- Log interaction ---
        active_constraints = len(raw_constraints)
        log_interaction(
            conn,
            event_type="refine_applied",
            payload={
                "playlist_id": body.playlist_id,
                "constraint_count": active_constraints,
            },
        )

        return result

    finally:
        conn.close()
