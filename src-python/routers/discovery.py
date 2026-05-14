"""
routers/discovery.py — Discovery Mode endpoints.

POST /discovery/start
    Start a new discovery session seeded by a track.
    Returns { session_id, track }.

POST /discovery/feedback
    Submit keep/skip feedback for a track.
    Updates centroid on keep; returns next track.

POST /discovery/end
    End a discovery session, setting status='ended'.
"""

import json
import time
import uuid

import spotipy
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, field_validator

from db import (
    create_discovery_session,
    end_discovery_session,
    get_db,
    get_discovery_session,
    log_interaction,
    update_discovery_centroid,
    upsert_user,
)
from discovery import (
    DEFAULT_CENTROID,
    centroid_from_features,
    get_discovery_tracks,
    update_centroid,
)
from spotify_client import get_client

router = APIRouter()


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------


class StartRequest(BaseModel):
    access_token: str
    seed_track_id: str


class FeedbackRequest(BaseModel):
    access_token: str
    session_id: str
    track_id: str
    action: str  # "keep" | "skip"

    @field_validator("action")
    @classmethod
    def validate_action(cls, v: str) -> str:
        if v not in ("keep", "skip"):
            raise ValueError("action must be 'keep' or 'skip'")
        return v


class EndRequest(BaseModel):
    access_token: str
    session_id: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _format_track(track: dict) -> dict:
    """Return a DiscoveryTrack dict safe for API responses."""
    return {
        "id": track.get("id"),
        "name": track.get("name"),
        "artists": track.get("artists", []),
        "album": track.get("album"),
        "album_art_url": track.get("album_art_url"),
        "duration_ms": track.get("duration_ms"),
    }


def _get_sp_and_user(access_token: str):
    """Authenticate with Spotify; raise HTTPException on failure."""
    try:
        sp = get_client(access_token)
        me = sp.current_user()
        return sp, me
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


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.post("/start")
def start_discovery(body: StartRequest):
    """Start a discovery session seeded by a single track."""
    if not body.access_token:
        raise HTTPException(status_code=400, detail="access_token is required")

    sp, me = _get_sp_and_user(body.access_token)
    user_id: str = me["id"]

    # Upsert user
    conn = get_db()
    try:
        upsert_user(conn, me)
    finally:
        conn.close()

    # Fetch audio features for seed track to initialize centroid
    centroid = dict(DEFAULT_CENTROID)
    try:
        features_list = sp.audio_features([body.seed_track_id])
        if features_list and features_list[0]:
            centroid = centroid_from_features(features_list[0])
    except Exception:
        pass  # Fall back to DEFAULT_CENTROID — best-effort

    session_id = str(uuid.uuid4())
    centroid_json = json.dumps(centroid)

    conn = get_db()
    try:
        create_discovery_session(conn, session_id, user_id, body.seed_track_id, centroid_json)
        log_interaction(
            conn,
            "discovery_started",
            {
                "session_id": session_id,
                "seed_track_id": body.seed_track_id,
                "user_id": user_id,
            },
        )
    finally:
        conn.close()

    # Pre-fetch a small batch of recommendations
    tracks = get_discovery_tracks(sp, body.seed_track_id, centroid, limit=5)
    first_track = _format_track(tracks[0]) if tracks else None

    return {"session_id": session_id, "track": first_track}


@router.post("/feedback")
def discovery_feedback(body: FeedbackRequest):
    """Submit keep/skip feedback; return the next recommended track."""
    sp, me = _get_sp_and_user(body.access_token)

    conn = get_db()
    try:
        session = get_discovery_session(conn, body.session_id)
    finally:
        conn.close()

    if session is None:
        raise HTTPException(status_code=404, detail="Discovery session not found")

    centroid = json.loads(session["centroid"]) if session.get("centroid") else dict(DEFAULT_CENTROID)
    seed_track_id = session.get("seed_track_id", body.track_id)

    if body.action == "keep":
        # Update centroid toward the liked track's features
        try:
            features_list = sp.audio_features([body.track_id])
            if features_list and features_list[0]:
                liked_features = centroid_from_features(features_list[0])
                centroid = update_centroid(centroid, liked_features)
        except Exception:
            pass  # Best-effort: keep existing centroid on error

        conn = get_db()
        try:
            update_discovery_centroid(conn, body.session_id, json.dumps(centroid))
        finally:
            conn.close()

    conn = get_db()
    try:
        log_interaction(
            conn,
            "discovery_feedback",
            {
                "session_id": body.session_id,
                "track_id": body.track_id,
                "action": body.action,
            },
        )
    finally:
        conn.close()

    # Fetch next batch of tracks
    tracks = get_discovery_tracks(sp, seed_track_id, centroid, limit=3)
    next_track = _format_track(tracks[0]) if tracks else None

    return {"track": next_track, "session_id": body.session_id}


@router.post("/end")
def end_discovery(body: EndRequest):
    """End a discovery session."""
    _get_sp_and_user(body.access_token)  # validate token

    conn = get_db()
    try:
        session = get_discovery_session(conn, body.session_id)
        if session is None:
            raise HTTPException(status_code=404, detail="Discovery session not found")
        end_discovery_session(conn, body.session_id)
        log_interaction(
            conn,
            "discovery_ended",
            {"session_id": body.session_id},
        )
    finally:
        conn.close()

    return {"status": "ended"}
