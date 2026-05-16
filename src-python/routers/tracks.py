"""
routers/tracks.py — Audio features endpoint.

GET /tracks/audio-features?track_ids=id1,id2,...&access_token=<token>
    Checks cache for each requested track ID.
    Batch-fetches only uncached IDs from Spotify (max 100 per call).
    Upserts into audio_features table.
    Returns all requested features (cache + fresh).
"""

import time
from typing import List, Optional

import spotipy
from fastapi import APIRouter, HTTPException, Query

import rapidapi_client
from db import get_ai_config, get_cached_features, get_db, upsert_audio_features
from spotify_client import get_client

router = APIRouter()

_BATCH_SIZE = 100


def _synthetic_features(track_id: str) -> dict:
    """Return mid-range feature values when Spotify's audio-features endpoint is unavailable.

    Spotify removed /audio-features for most apps. This fallback keeps the
    Refinement sliders functional with neutral values rather than crashing.
    """
    return {
        "id": track_id,
        "energy": 0.5,
        "tempo": 120.0,
        "valence": 0.5,
        "danceability": 0.5,
        "acousticness": 0.3,
        "instrumentalness": 0.1,
        "speechiness": 0.05,
        "loudness": -8.0,
        "key": 0,
        "mode": 1,
        "time_signature": 4,
        "duration_ms": None,
        "source": "synthetic",
    }


def _spotify_features_to_dict(raw: dict, source: str = "spotify") -> dict:
    """Map a Spotify audio features object to our DB/response shape.

    The ``source`` parameter is forwarded from the caller so that RapidAPI
    results can be marked as ``"rapidapi"`` while Spotify results keep the
    default ``"spotify"`` label.
    """
    return {
        "track_id": raw.get("track_id") or raw.get("id"),
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
        "source": raw.get("source") or source,
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
        "source": row.get("source"),
    }


@router.get("/audio-features")
def get_audio_features(
    track_ids: str = Query(..., description="Comma-separated Spotify track IDs"),
    access_token: str = Query(..., description="Spotify access token"),
    rapidapi_key: Optional[str] = Query(None, description="RapidAPI key for SoundNet fallback"),
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
        # Try to read stored key from DB if not passed in query
        if not rapidapi_key:
            stored_key = get_ai_config(conn, "rapidapi_key")
            if stored_key:
                rapidapi_key = stored_key

        cached_map = get_cached_features(conn, ids)

        # When a RapidAPI key is configured, treat previously-synthesised
        # entries as cache misses so they get replaced with real data.
        if rapidapi_key:
            cached_map = {
                tid: row
                for tid, row in cached_map.items()
                if row.get("source") not in (None, "synthetic")
            }

        uncached_ids = [tid for tid in ids if tid not in cached_map]

        if uncached_ids:
            if rapidapi_key:
                # RapidAPI key is configured → skip Spotify entirely and use
                # RapidAPI (SoundNet) as the primary source.  Spotify's
                # /audio-features endpoint is deprecated for most apps (403),
                # so attempting it first only wastes time.
                rapid_results = rapidapi_client.get_features_batch(uncached_ids, rapidapi_key)
                fetched_ids: set = set()
                for row in rapid_results:
                    row.setdefault("source", "rapidapi")
                    upsert_audio_features(conn, row)
                    cached_map[row["track_id"]] = row
                    fetched_ids.add(row["track_id"])
                # Synthetic fallback for any tracks RapidAPI couldn't return
                for tid in uncached_ids:
                    if tid not in fetched_ids:
                        synth = _synthetic_features(tid)
                        row = _spotify_features_to_dict(synth)
                        upsert_audio_features(conn, row)
                        cached_map[tid] = row
            else:
                # No RapidAPI key: try Spotify, synthetic fallback on 403/400
                try:
                    sp = get_client(access_token)
                except Exception as exc:
                    raise HTTPException(
                        status_code=500, detail=f"Spotify client error: {exc}"
                    )

                for i in range(0, len(uncached_ids), _BATCH_SIZE):
                    batch = uncached_ids[i : i + _BATCH_SIZE]
                    results = None
                    try:
                        results = sp.audio_features(batch)
                    except spotipy.SpotifyException as exc:
                        status = exc.http_status if hasattr(exc, "http_status") else 500
                        if status == 401:
                            raise HTTPException(
                                status_code=401,
                                detail="Invalid or expired Spotify token",
                            )
                        if status in (400, 403):
                            results = [_synthetic_features(tid) for tid in batch]
                        else:
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

        # Return results in the original request order, omitting missing IDs
        return [
            _response_features(cached_map[tid])
            for tid in ids
            if tid in cached_map
        ]

    finally:
        conn.close()
