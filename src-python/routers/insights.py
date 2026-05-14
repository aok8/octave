"""
routers/insights.py — Audio-feature insights aggregation endpoint.

GET /insights/{playlist_id}
    Returns genre breakdown and per-track timeline data for a playlist.

Optional query parameter:
    mock_genres=true — return a diverse, demo-friendly genre distribution
                       instead of the real (all-"Other") genre data.
"""

from __future__ import annotations

import random
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from db import get_cached_features, get_cached_tracks, get_db, log_interaction
from genre import GENRE_COLORS

router = APIRouter()

# ---------------------------------------------------------------------------
# Mock genre distribution used when ?mock_genres=true is passed.
# This lets the frontend donut chart show meaningful colours in fixtures/demo.
# ---------------------------------------------------------------------------
_MOCK_GENRES = [
    "Hip-Hop",
    "RnB",
    "Neo-Soul",
    "Chill Pop",
    "Lo-Fi",
    "Nu-Jazz",
    "Other",
]


def _assign_mock_genre(position: int) -> str:
    """Cycle through mock genres in a deterministic round-robin fashion."""
    return _MOCK_GENRES[position % len(_MOCK_GENRES)]


# ---------------------------------------------------------------------------
# Route
# ---------------------------------------------------------------------------


@router.get("/{playlist_id}")
def get_insights(
    playlist_id: str,
    mock_genres: bool = Query(False),
):
    """Return genre breakdown and timeline for a playlist.

    Genre classification note (v1 limitation)
    ------------------------------------------
    The ``tracks`` table does not store Spotify artist genre strings — those
    come from a separate Spotify artist endpoint and are not cached by the
    current ingestion pipeline.  Until artist genres are ingested, every
    track is classified as ``"Other"``.

    Pass ``?mock_genres=true`` to receive a representative, diverse genre
    distribution for demo / fixture purposes.
    """
    conn = get_db()
    try:
        # --- Verify playlist exists ---
        row = conn.execute(
            "SELECT id FROM playlists WHERE id = ?", (playlist_id,)
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail=f"Playlist '{playlist_id}' not found")

        # --- Fetch tracks for the playlist (ordered by position) ---
        tracks = get_cached_tracks(conn, playlist_id)
        total_tracks = len(tracks)

        # --- Fetch audio features for all track IDs ---
        track_ids = [t["id"] for t in tracks]
        features_by_id = get_cached_features(conn, track_ids) if track_ids else {}

        # --- Build timeline + genre assignment ---
        timeline = []
        genre_counts: dict[str, int] = {}
        # subgenres: genre → set of subgenre strings (v1: empty since no artist data)
        genre_subgenres: dict[str, set] = {}

        for track in tracks:
            tid = track["id"]
            pos = track.get("position", 0)
            feats = features_by_id.get(tid, {})

            # Genre assignment
            # v1: no artist genre data in DB → default "Other" unless mock requested
            if mock_genres:
                genre = _assign_mock_genre(pos)
            else:
                genre = "Other"

            genre_counts[genre] = genre_counts.get(genre, 0) + 1
            genre_subgenres.setdefault(genre, set())

            timeline.append(
                {
                    "position": pos,
                    "track_id": tid,
                    "energy": feats.get("energy"),
                    "valence": feats.get("valence"),
                    "danceability": feats.get("danceability"),
                    "genre": genre,
                }
            )

        # --- Build genre breakdown list ---
        genre_breakdown = [
            {
                "genre": genre,
                "count": count,
                "color": GENRE_COLORS.get(genre, GENRE_COLORS["Other"]),
                "subgenres": sorted(genre_subgenres.get(genre, set())),
            }
            for genre, count in genre_counts.items()
        ]
        # Sort by count descending so the biggest slice comes first
        genre_breakdown.sort(key=lambda x: x["count"], reverse=True)

        # --- Log interaction ---
        log_interaction(
            conn,
            event_type="insights_viewed",
            payload={"playlist_id": playlist_id},
        )

        return {
            "playlist_id": playlist_id,
            "genre_breakdown": genre_breakdown,
            "timeline": timeline,
            "total_tracks": total_tracks,
        }

    finally:
        conn.close()
