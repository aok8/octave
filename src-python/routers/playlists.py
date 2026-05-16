"""
routers/playlists.py — Playlist and playlist-track endpoints.

GET /playlists
    Returns the user's playlists.  Serves from SQLite cache unless
    force_refresh=true or no cached data exists.
    Stale-while-revalidate: if cached data is older than 5 minutes,
    return cached data immediately and trigger a background refresh.

GET /playlists/{playlist_id}/tracks
    Returns the full tracklist for a playlist, handling Spotify's
    100-items-per-page pagination limit.
"""

import json
import sys
import time
from typing import Optional

import spotipy
from fastapi import APIRouter, BackgroundTasks, HTTPException, Query

from genre import classify_genre
from db import (
    get_cached_playlists,
    get_cached_tracks,
    get_db,
    get_recently_used,
    log_interaction,
    update_recently_used,
    update_track_genres,
    upsert_playlist,
    upsert_playlist_track,
    upsert_track,
    upsert_user,
)
from spotify_client import get_client

router = APIRouter()

# Root-level router for endpoints that live outside the /playlists prefix.
root_router = APIRouter()

_STALE_THRESHOLD_SECONDS = 300  # 5 minutes


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _spotify_playlist_to_dict(item: dict, user_id: str) -> dict:
    """Map a Spotify playlist object to our DB/response shape."""
    images = item.get("images") or []
    cover_url = images[0]["url"] if images else None
    return {
        "id": item["id"],
        "user_id": user_id,
        "name": item["name"],
        "description": item.get("description") or None,
        "cover_url": cover_url,
        "track_count": (item.get("tracks") or {}).get("total", 0),
        "is_public": bool(item.get("public")),
        "snapshot_id": item.get("snapshot_id"),
        "cached_at": int(time.time()),
    }


def _response_playlist(row: dict) -> dict:
    """Strip internal user_id from the response shape."""
    return {
        "id": row["id"],
        "name": row["name"],
        "description": row.get("description"),
        "cover_url": row.get("cover_url"),
        "track_count": row.get("track_count", 0),
        "is_public": bool(row.get("is_public")),
        "snapshot_id": row.get("snapshot_id"),
        "cached_at": row.get("cached_at", 0),
    }


def _fetch_and_cache_playlists(sp: spotipy.Spotify, user_id: str) -> list:
    """Fetch all playlists from Spotify, upsert to DB, return list."""
    conn = get_db()
    results = []
    try:
        response = sp.current_user_playlists(limit=50)
        while response:
            for item in response.get("items") or []:
                if item is None:
                    continue
                # Only include playlists the user owns (not followed/saved ones)
                if (item.get("owner") or {}).get("id") != user_id:
                    continue
                row = _spotify_playlist_to_dict(item, user_id)
                upsert_playlist(conn, row)
                results.append(row)
            if response.get("next"):
                response = sp.next(response)
            else:
                break
    finally:
        conn.close()
    return results


def _spotify_track_to_dict(item: dict) -> dict:
    """Map a Spotify track object (from playlist items) to our DB shape."""
    track = item.get("track") or item.get("item") or item  # Spotify uses "track" or "item" key
    if track is None:
        return {}
    artists = [a.get("name", "") for a in (track.get("artists") or [])]
    artist_ids = [a.get("id", "") for a in (track.get("artists") or []) if a.get("id")]
    images = (track.get("album") or {}).get("images") or []
    album_art_url = images[0]["url"] if images else None
    return {
        "id": track["id"],
        "name": track.get("name", ""),
        "artist_names": artists,
        "artist_ids": artist_ids,
        "album_name": (track.get("album") or {}).get("name"),
        "album_art_url": album_art_url,
        "duration_ms": track.get("duration_ms"),
        "popularity": track.get("popularity"),
        "cached_at": int(time.time()),
    }


def _response_track(row: dict) -> dict:
    """Convert a DB row to the API response shape matching the Track interface."""
    artist_names = row.get("artist_names", [])
    if isinstance(artist_names, str):
        try:
            artist_names = json.loads(artist_names)
        except (json.JSONDecodeError, TypeError):
            artist_names = [artist_names] if artist_names else []

    # Parse stored genres and classify into an Octave genre bucket.
    # genres may be a JSON string (from DB) or already a list (in-memory).
    genres_raw = row.get("genres")
    if isinstance(genres_raw, str):
        try:
            genres_list = json.loads(genres_raw)
        except (json.JSONDecodeError, TypeError):
            genres_list = []
    elif isinstance(genres_raw, list):
        genres_list = list(genres_raw)
    else:
        genres_list = []
    genre_bucket: str | None = classify_genre(genres_list) if genres_list else None

    return {
        "id": row["id"],
        "name": row["name"],
        "artist_names": artist_names,
        "album_name": row.get("album_name"),
        "album_art_url": row.get("album_art_url"),
        "duration_ms": row.get("duration_ms"),
        "popularity": row.get("popularity"),
        "genre_bucket": genre_bucket,
    }


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.get("")
def get_playlists(
    access_token: str = Query(..., description="Spotify access token"),
    force_refresh: bool = Query(False),
    background_tasks: BackgroundTasks = None,
):
    """Return the current user's playlists.

    Serves from SQLite cache when force_refresh=false and data exists.
    Triggers a background refresh when cached data is older than 5 min.
    """
    try:
        sp = get_client(access_token)
        me = sp.current_user()
        user_id: str = me["id"]
        conn_user = get_db()
        try:
            upsert_user(conn_user, me)
        finally:
            conn_user.close()
    except spotipy.SpotifyException as exc:
        status = exc.http_status if hasattr(exc, "http_status") else 500
        if status == 401:
            raise HTTPException(status_code=401, detail="Invalid or expired Spotify token")
        raise HTTPException(status_code=status, detail=str(exc))
    except HTTPException:
        raise
    except Exception as exc:
        exc_str = str(exc)
        if "401" in exc_str:
            raise HTTPException(status_code=401, detail="Invalid or expired Spotify token")
        raise HTTPException(status_code=500, detail=f"Spotify client error: {exc}")

    conn = get_db()
    try:
        cached = get_cached_playlists(conn, user_id)
    finally:
        conn.close()

    if cached and not force_refresh:
        # Stale-while-revalidate: trigger background refresh if oldest entry > 5 min
        oldest_cached_at = min(
            (row.get("cached_at") or 0 for row in cached), default=0
        )
        if int(time.time()) - oldest_cached_at > _STALE_THRESHOLD_SECONDS:
            if background_tasks is not None:
                background_tasks.add_task(
                    _fetch_and_cache_playlists, sp, user_id
                )
        conn_log = get_db()
        try:
            log_interaction(conn_log, event_type="playlist_viewed", payload={"user_id": user_id})
        finally:
            conn_log.close()
        return [_response_playlist(row) for row in cached]

    # Cache miss or forced refresh
    try:
        rows = _fetch_and_cache_playlists(sp, user_id)
    except spotipy.SpotifyException as exc:
        status = exc.http_status if hasattr(exc, "http_status") else 500
        raise HTTPException(status_code=status, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to fetch playlists: {exc}")

    conn_log = get_db()
    try:
        log_interaction(conn_log, event_type="playlist_viewed", payload={"user_id": user_id})
    finally:
        conn_log.close()
    return [_response_playlist(row) for row in rows]


@router.get("/{playlist_id}/tracks")
def get_playlist_tracks(
    playlist_id: str,
    access_token: str = Query(..., description="Spotify access token"),
    force_refresh: bool = Query(False),
):
    """Return the full tracklist for a playlist.

    Handles Spotify's 100-items-per-page pagination.
    Upserts into tracks and playlist_tracks tables.
    Updates recently_used with the current timestamp.
    """
    conn = get_db()
    try:
        # Serve from cache if available and not forcing refresh
        if not force_refresh:
            cached = get_cached_tracks(conn, playlist_id)
            if cached:
                update_recently_used(conn, playlist_id)
                return [_response_track(row) for row in cached]
    except Exception:
        pass  # Fall through to live fetch on any cache read error

    try:
        sp = get_client(access_token)
    except Exception as exc:
        conn.close()
        raise HTTPException(status_code=500, detail=f"Spotify client error: {exc}")

    try:
        tracks_out = []
        local_tracks_out = []
        response = sp.playlist_items(playlist_id, limit=100)
        items = (response or {}).get("items") or []
        print(f"[tracks] playlist={playlist_id} total_items={len(items)}", file=sys.stderr, flush=True)
        # Log structure of first item to diagnose null-track cases
        if items:
            first = items[0] or {}
            t = first.get("track") or first.get("item")
            print(
                f"[tracks] first_item keys={list(first.keys())} "
                f"track_null={t is None} "
                f"track_id={t.get('id') if t else 'N/A'} "
                f"track_type={t.get('type') if t else 'N/A'} "
                f"is_local={first.get('is_local', t.get('is_local') if t else 'N/A')}",
                file=sys.stderr, flush=True,
            )
        position = 0
        while response:
            for item in response.get("items") or []:
                if item is None:
                    continue
                # Spotify returns track data under "track" or "item" key
                track = item.get("track") or item.get("item")
                # is_local is a top-level field on the playlist item
                is_local_file = bool(item.get("is_local", False))
                if track is None:
                    position += 1
                    continue
                # Local files have no Spotify ID — pass them through as-is
                if track.get("id") is None or is_local_file:
                    artists = [a.get("name", "") for a in (track.get("artists") or [])]
                    local_tracks_out.append({
                        "id": None,
                        "name": track.get("name", "Unknown"),
                        "artist_names": artists,
                        "album_name": (track.get("album") or {}).get("name"),
                        "album_art_url": None,
                        "duration_ms": track.get("duration_ms"),
                        "popularity": None,
                        "genre_bucket": None,
                        "is_local": True,
                    })
                    position += 1
                    continue
                row = _spotify_track_to_dict(item)
                # Convert added_at ISO timestamp to unix seconds
                added_at_str = item.get("added_at")
                added_at: Optional[int] = None
                if added_at_str:
                    try:
                        from datetime import datetime, timezone
                        dt = datetime.fromisoformat(
                            added_at_str.replace("Z", "+00:00")
                        )
                        added_at = int(dt.timestamp())
                    except Exception:
                        added_at = None
                # Cache the track and its playlist membership.
                # Wrapped in try/except so a schema mismatch or constraint
                # error (e.g. DB migrations still running at startup) never
                # prevents tracks from being delivered to the frontend.
                try:
                    upsert_track(conn, row)
                    upsert_playlist_track(conn, playlist_id, row["id"], position, added_at)
                except Exception as cache_exc:
                    print(
                        f"[tracks] warn: failed to cache track {row.get('id')}: "
                        f"{type(cache_exc).__name__}: {cache_exc}",
                        file=sys.stderr, flush=True,
                    )
                tracks_out.append(row)
                position += 1
            if response.get("next"):
                response = sp.next(response)
            else:
                break

        # --- Batch-fetch artist genres and update tracks ---
        # Collect unique artist IDs from all ingested tracks
        all_artist_ids: list[str] = []
        artist_to_tracks: dict[str, list[str]] = {}  # artist_id → [track_id, ...]
        for row in tracks_out:
            for aid in (row.get("artist_ids") or []):
                if aid and aid not in artist_to_tracks:
                    all_artist_ids.append(aid)
                artist_to_tracks.setdefault(aid, []).append(row["id"])

        # genres_map keeps in-memory genres so _response_track can classify
        # without a second DB round-trip for freshly-fetched tracks.
        genres_map: dict[str, list[str]] = {}

        # Fetch in batches of 50 (Spotify API limit)
        for i in range(0, len(all_artist_ids), 50):
            batch = all_artist_ids[i : i + 50]
            try:
                result = sp.artists(batch)
                for artist in (result.get("artists") or []):
                    if artist is None:
                        continue
                    aid = artist.get("id")
                    genres = artist.get("genres") or []
                    if aid and genres:
                        for tid in artist_to_tracks.get(aid, []):
                            update_track_genres(conn, tid, genres)
                            # Accumulate for in-memory classification
                            existing = genres_map.get(tid, [])
                            for g in genres:
                                if g not in existing:
                                    existing.append(g)
                            genres_map[tid] = existing
            except Exception:
                pass  # Genre enrichment is best-effort; never block track delivery

        # Attach genres to in-memory rows so _response_track can classify them
        for row in tracks_out:
            if row["id"] in genres_map:
                row["genres"] = genres_map[row["id"]]

        print(f"[tracks] returning {len(tracks_out)} spotify + {len(local_tracks_out)} local", file=sys.stderr, flush=True)
        try:
            update_recently_used(conn, playlist_id)
        except Exception as ru_exc:
            print(f"[tracks] warn: recently_used update failed: {ru_exc}", file=sys.stderr, flush=True)
        return [_response_track(row) for row in tracks_out] + local_tracks_out

    except spotipy.SpotifyException as exc:
        status = exc.http_status if hasattr(exc, "http_status") else 500
        print(f"[tracks] SpotifyException {status}: {exc}", file=sys.stderr, flush=True)
        if status == 401:
            raise HTTPException(status_code=401, detail="Invalid or expired Spotify token")
        raise HTTPException(status_code=status, detail=str(exc))
    except HTTPException:
        raise
    except Exception as exc:
        print(f"[tracks] Exception {type(exc).__name__}: {exc}", file=sys.stderr, flush=True)
        raise HTTPException(status_code=500, detail=f"Failed to fetch tracks: {exc}")
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Root-level recently-used route (served at GET /recently-used)
# ---------------------------------------------------------------------------


@root_router.get("/recently-used")
def recently_used():
    """Return the 6 most recently opened playlists."""
    conn = get_db()
    try:
        rows = get_recently_used(conn, limit=6)
        return rows
    finally:
        conn.close()
