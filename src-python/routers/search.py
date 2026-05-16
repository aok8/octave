"""
routers/search.py — Search and recommendations endpoints.

GET /search/tracks?q=<query>&access_token=<token>&limit=20
    Searches Spotify catalog. Results are NOT cached (ephemeral).

GET /recommendations?seed_track_id=<id>&access_token=<token>&limit=30
    Calls Spotify Recommendations API.
    Accepts optional audio feature target params.
    Caches returned tracks in the tracks table.
"""

import json
import time
import spotipy
from fastapi import APIRouter, HTTPException, Query

from db import get_db, upsert_track
from similarity import find_similar_tracks
from spotify_client import get_client

router = APIRouter()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _spotify_track_to_response(track: dict) -> dict:
    """Map a Spotify track object to our Track response shape (snake_case)."""
    artists = [a.get("name", "") for a in (track.get("artists") or [])]
    images = (track.get("album") or {}).get("images") or []
    album_art_url = images[0]["url"] if images else None
    return {
        "id": track["id"],
        "name": track.get("name", ""),
        "artist_names": artists,
        "album_name": (track.get("album") or {}).get("name"),
        "album_art_url": album_art_url,
        "duration_ms": track.get("duration_ms"),
        "popularity": track.get("popularity"),
    }


def _spotify_track_to_db(track: dict) -> dict:
    """Map a Spotify track object to the DB row shape."""
    artists = [a.get("name", "") for a in (track.get("artists") or [])]
    images = (track.get("album") or {}).get("images") or []
    album_art_url = images[0]["url"] if images else None
    return {
        "id": track["id"],
        "name": track.get("name", ""),
        "artist_names": artists,
        "album_name": (track.get("album") or {}).get("name"),
        "album_art_url": album_art_url,
        "duration_ms": track.get("duration_ms"),
        "popularity": track.get("popularity"),
        "cached_at": int(time.time()),
    }


# ---------------------------------------------------------------------------
# Search route (mounted at /search by main.py, but registered here with full
# path so it can also be used standalone)
# ---------------------------------------------------------------------------


@router.get("/tracks")
def search_tracks(
    q: str = Query(..., description="Search query string"),
    access_token: str = Query(..., description="Spotify access token"),
    limit: int = Query(20, ge=1, le=50, description="Number of results to return"),
):
    """Search the Spotify catalog for tracks. Results are NOT cached."""
    if not q.strip():
        raise HTTPException(status_code=400, detail="Search query must not be empty")

    try:
        sp = get_client(access_token)
        result = sp.search(q=q, type="track", limit=limit, additional_types=("track",))
    except spotipy.SpotifyException as exc:
        status = exc.http_status if hasattr(exc, "http_status") else 500
        if status == 401:
            raise HTTPException(
                status_code=401, detail="Invalid or expired Spotify token"
            )
        raise HTTPException(status_code=status, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Search failed: {exc}")

    tracks = (result.get("tracks") or {}).get("items") or []
    return [_spotify_track_to_response(t) for t in tracks if t and t.get("id")]


# ---------------------------------------------------------------------------
# Recommendations route
# ---------------------------------------------------------------------------


@router.get("/recommendations")
def get_recommendations(
    seed_track_id: str = Query(..., description="Spotify track ID to use as seed"),
    access_token: str = Query(..., description="Spotify access token"),
    limit: int = Query(30, ge=1, le=100, description="Number of recommendations"),
):
    """Return tracks by the same primary artist as the seed track.

    The Spotify /recommendations endpoint was removed from the public API.
    This endpoint fetches the seed track's primary artist and returns other
    tracks by that artist via catalog search. Returned tracks are cached in
    the tracks table.
    """
    if not seed_track_id.strip():
        raise HTTPException(status_code=400, detail="seed_track_id must not be empty")

    try:
        sp = get_client(access_token)
        seed = sp.track(seed_track_id)
    except spotipy.SpotifyException as exc:
        status = exc.http_status if hasattr(exc, "http_status") else 500
        if status == 401:
            raise HTTPException(status_code=401, detail="Invalid or expired Spotify token")
        raise HTTPException(status_code=status, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to fetch seed track: {exc}")

    artists = seed.get("artists") or []
    if not artists:
        return []

    artist_name = artists[0].get("name", "")
    if not artist_name:
        return []

    try:
        result = sp.search(q=f'artist:"{artist_name}"', type="track", limit=min(limit, 50))
    except spotipy.SpotifyException as exc:
        status = exc.http_status if hasattr(exc, "http_status") else 500
        if status == 401:
            raise HTTPException(status_code=401, detail="Invalid or expired Spotify token")
        raise HTTPException(status_code=status, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Recommendations fetch failed: {exc}")

    raw_tracks = (result.get("tracks") or {}).get("items") or []
    tracks = [t for t in raw_tracks if t and t.get("id") and t["id"] != seed_track_id][:limit]

    conn = get_db()
    try:
        for track in tracks:
            upsert_track(conn, _spotify_track_to_db(track))
    finally:
        conn.close()

    return [_spotify_track_to_response(t) for t in tracks]


# ---------------------------------------------------------------------------
# Similarity-based recommendations route
# ---------------------------------------------------------------------------


@router.get("/recommendations/similar")
def get_similar_recommendations(
    track_id: str = Query(..., description="Seed Spotify track ID"),
    limit: int = Query(20, ge=1, le=100, description="Max results to return"),
    access_token: str = Query(..., description="Spotify access token (required for API contract consistency)"),
):
    """Return tracks similar to the seed track using cosine similarity over cached audio features.

    Falls back to the artist-search path (``GET /recommendations``) when the
    local audio_features cache contains fewer than 3 candidate tracks.
    """
    if not track_id.strip():
        raise HTTPException(status_code=400, detail="track_id must not be empty")

    conn = get_db()
    try:
        results = find_similar_tracks(track_id, conn, limit=limit)
    finally:
        conn.close()

    # Sparse-cache fallback: if fewer than 3 results, use artist-search
    if len(results) < 3:
        try:
            sp = get_client(access_token)
            seed = sp.track(track_id)
        except spotipy.SpotifyException as exc:
            status = exc.http_status if hasattr(exc, "http_status") else 500
            if status == 401:
                raise HTTPException(status_code=401, detail="Invalid or expired Spotify token")
            raise HTTPException(status_code=status, detail=str(exc))
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Failed to fetch seed track: {exc}")

        artists = seed.get("artists") or []
        if not artists:
            return []
        artist_name = artists[0].get("name", "")
        if not artist_name:
            return []

        try:
            search_result = sp.search(q=f'artist:"{artist_name}"', type="track", limit=min(limit, 50))
        except spotipy.SpotifyException as exc:
            status = exc.http_status if hasattr(exc, "http_status") else 500
            if status == 401:
                raise HTTPException(status_code=401, detail="Invalid or expired Spotify token")
            raise HTTPException(status_code=status, detail=str(exc))
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Similar recommendations fallback failed: {exc}")

        raw_tracks = (search_result.get("tracks") or {}).get("items") or []
        fallback_tracks = [t for t in raw_tracks if t and t.get("id") and t["id"] != track_id][:limit]
        return [
            {
                "track_id": t["id"],
                "score": 0.0,
                "matching_features": [],
            }
            for t in fallback_tracks
        ]

    return results
