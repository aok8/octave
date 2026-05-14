"""
routers/export.py — Spotify playlist export endpoints.

POST /export/new
    Create a brand-new private Spotify playlist and populate it with the
    supplied track IDs.

POST /export/overwrite/{playlist_id}
    Replace the contents of an existing Spotify playlist with the supplied
    track IDs.
"""

from __future__ import annotations

import math
from typing import List, Optional

import spotipy
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from db import get_db, log_interaction

router = APIRouter()

# Spotify's API limit for adding/replacing tracks in a single request.
_CHUNK_SIZE = 100
_MAX_TRACK_IDS = 10_000


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------


class ExportNewRequest(BaseModel):
    name: str
    description: str = ""
    track_ids: List[str]
    token: str


class ExportOverwriteRequest(BaseModel):
    track_ids: List[str]
    token: str


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _spotify_client(token: str) -> spotipy.Spotify:
    """Return an authenticated Spotipy client for the given access token."""
    return spotipy.Spotify(auth=token)


def _uri_list(track_ids: List[str]) -> List[str]:
    """Convert bare track IDs to Spotify URI strings."""
    return [f"spotify:track:{tid}" if not tid.startswith("spotify:") else tid for tid in track_ids]


def _add_tracks_in_chunks(sp: spotipy.Spotify, playlist_id: str, track_ids: List[str]) -> None:
    """Add tracks to a playlist in batches of ``_CHUNK_SIZE``."""
    uris = _uri_list(track_ids)
    for i in range(0, len(uris), _CHUNK_SIZE):
        chunk = uris[i : i + _CHUNK_SIZE]
        sp.playlist_add_items(playlist_id, chunk)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.post("/new")
def export_new(body: ExportNewRequest):
    """Create a new private Spotify playlist and populate it with track_ids.

    Validation
    ----------
    - ``name`` must be ≤ 100 characters.
    - ``description`` must be ≤ 300 characters.
    - ``track_ids`` must not be empty.

    Returns
    -------
    ``{"playlist_url": "...", "playlist_id": "..."}``
    """
    # --- Validate ---
    if len(body.name) > 100:
        raise HTTPException(
            status_code=422,
            detail={"field": "name", "error": "exceeds 100 character limit"},
        )
    if len(body.description) > 300:
        raise HTTPException(
            status_code=422,
            detail={"field": "description", "error": "exceeds 300 character limit"},
        )
    if not body.track_ids:
        raise HTTPException(
            status_code=422,
            detail={"field": "track_ids", "error": "must not be empty"},
        )

    sp = _spotify_client(body.token)

    # --- Get the current user's ID ---
    user_id = sp.current_user()["id"]

    # --- Create the playlist ---
    playlist = sp.user_playlist_create(
        user_id,
        body.name,
        public=False,
        description=body.description,
    )
    new_playlist_id: str = playlist["id"]
    playlist_url: str = playlist["external_urls"]["spotify"]

    # --- Add tracks in chunks of 100 ---
    _add_tracks_in_chunks(sp, new_playlist_id, body.track_ids)

    # --- Log interaction ---
    conn = get_db()
    try:
        log_interaction(
            conn,
            event_type="playlist_exported",
            payload={
                "playlist_id": new_playlist_id,
                "mode": "new",
                "track_count": len(body.track_ids),
            },
        )
    finally:
        conn.close()

    return {"playlist_url": playlist_url, "playlist_id": new_playlist_id}


@router.post("/overwrite/{playlist_id}")
def export_overwrite(playlist_id: str, body: ExportOverwriteRequest):
    """Replace all tracks in an existing Spotify playlist.

    Validation
    ----------
    - ``track_ids`` must not be empty.
    - ``track_ids`` must contain ≤ 10,000 entries.

    Strategy
    --------
    1. ``playlist_replace_items`` replaces all current tracks with the first
       100 provided URIs (this is Spotify's atomic replace operation).
    2. Remaining tracks are appended in chunks of 100 via
       ``playlist_add_items``.

    Returns
    -------
    ``{"playlist_url": "...", "playlist_id": "..."}``
    """
    # --- Validate ---
    if not body.track_ids:
        raise HTTPException(
            status_code=422,
            detail={"field": "track_ids", "error": "must not be empty"},
        )
    if len(body.track_ids) > _MAX_TRACK_IDS:
        raise HTTPException(
            status_code=422,
            detail={
                "field": "track_ids",
                "error": f"exceeds {_MAX_TRACK_IDS} track limit",
            },
        )

    sp = _spotify_client(body.token)

    uris = _uri_list(body.track_ids)

    # --- Replace first 100 tracks (atomic operation) ---
    first_chunk = uris[:_CHUNK_SIZE]
    sp.playlist_replace_items(playlist_id, first_chunk)

    # --- Append remaining tracks in chunks of 100 ---
    for i in range(_CHUNK_SIZE, len(uris), _CHUNK_SIZE):
        chunk = uris[i : i + _CHUNK_SIZE]
        sp.playlist_add_items(playlist_id, chunk)

    playlist_url = f"https://open.spotify.com/playlist/{playlist_id}"

    # --- Log interaction ---
    conn = get_db()
    try:
        log_interaction(
            conn,
            event_type="playlist_exported",
            payload={
                "playlist_id": playlist_id,
                "mode": "overwrite",
                "track_count": len(body.track_ids),
            },
        )
    finally:
        conn.close()

    return {"playlist_url": playlist_url, "playlist_id": playlist_id}
