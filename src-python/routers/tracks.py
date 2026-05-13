"""
routers/tracks.py — Audio features endpoint.

GET /tracks/audio-features?track_ids=id1,id2,...&access_token=<token>
    Checks cache for each requested track ID.
    Batch-fetches only uncached IDs from Spotify (max 100 per call).
    Upserts into audio_features table.
    Returns all requested features (cache + fresh).
"""

import time
from typing import List

import spotipy
from fastapi import APIRouter, HTTPException, Query

from db import get_cached_features, get_db, upsert_audio_features
from spotify_client import get_client

router = APIRouter()

_BATCH_SIZE = 100


def _spotify_features_to_dict(raw: dict) -> dict:
    """Map a Spotify audio features object to our DB/response shape."""
    return {
        "track_id": raw["id"],
        "energy": raw.get("energy"),
        "tempo": raw.get("tempo"),
        "valence": raw.get("valence"),
        "danceability": raw.get("danceability"),
        "acousticness": raw.get("acousticness"),
        "instrumentalness": raw.get("instrumentalness"),
        "speechiness": raw.get("speechiness"),
        "loudness": raw.get("loudness"),
        "key": raw.get("key"),
        "mode": raw.get("mode"),
        "time_signature": raw.get("time_signature"),
        "cached_at": int(time.time()),
    }


def _response_features(row: dict) -> dict:
    """Convert a DB row to the API response shape matching AudioFeatures."""
    return {
        "track_id": row["track_id"],
        "energy": row.get("energy"),
        "tempo": row.get("tempo"),
        "valence": row.get("valence"),
        "danceability": row.get("danceability"),
        "acousticness": row.get("acousticness"),
        "instrumentalness": row.get("instrumentalness"),
        "speechiness": row.get("speechiness"),
        "loudness": row.get("loudness"),
        "key": row.get("key"),
        "mode": row.get("mode"),
        "time_signature": row.get("time_signature"),
        "cached_at": row.get("cached_at"),
    }


@router.get("/audio-features")
def get_audio_features(
    track_ids: str = Query(..., description="Comma-separated Spotify track IDs"),
    access_token: str = Query(..., description="Spotify access token"),
):
    """Return audio features for the requested track IDs.

    Checks cache first; only fetches uncached IDs from Spotify.
    Handles Spotify's 100-per-call batch limit.
    """
    if not track_ids.strip():
        raise HTTPException(status_code=400, detail="track_ids must not be empty")

    ids: List[str] = [tid.strip() for tid in track_ids.split(",") if tid.strip()]
    if not ids:
        raise HTTPException(status_code=400, detail="No valid track IDs provided")

    conn = get_db()
    try:
        cached_map = get_cached_features(conn, ids)
        uncached_ids = [tid for tid in ids if tid not in cached_map]

        if uncached_ids:
            try:
                sp = get_client(access_token)
            except Exception as exc:
                raise HTTPException(
                    status_code=500, detail=f"Spotify client error: {exc}"
                )

            # Batch into groups of 100
            fresh_features = []
            for i in range(0, len(uncached_ids), _BATCH_SIZE):
                batch = uncached_ids[i : i + _BATCH_SIZE]
                try:
                    results = sp.audio_features(batch)
                except spotipy.SpotifyException as exc:
                    status = exc.http_status if hasattr(exc, "http_status") else 500
                    if status == 401:
                        raise HTTPException(
                            status_code=401,
                            detail="Invalid or expired Spotify token",
                        )
                    raise HTTPException(status_code=status, detail=str(exc))
                except Exception as exc:
                    raise HTTPException(
                        status_code=500,
                        detail=f"Failed to fetch audio features: {exc}",
                    )

                for raw in results or []:
                    if raw is None:
                        continue
                    row = _spotify_features_to_dict(raw)
                    upsert_audio_features(conn, row)
                    cached_map[row["track_id"]] = row
                    fresh_features.append(row)

        # Return results in the original request order, omitting missing IDs
        return [
            _response_features(cached_map[tid])
            for tid in ids
            if tid in cached_map
        ]

    finally:
        conn.close()
