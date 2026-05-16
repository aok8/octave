"""
routers/insights.py — Audio-feature insights aggregation endpoint.

GET /insights/{playlist_id}
    Returns genre breakdown and per-track timeline data for a playlist.

Optional query parameter:
    mock_genres=true — return a diverse, demo-friendly genre distribution
                       instead of the real (all-"Other") genre data.
"""

from __future__ import annotations

import json as _json
import random
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from db import get_cached_features, get_cached_tracks, get_db, log_interaction
from genre import GENRE_COLORS, classify_genre

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

    Genre classification uses stored artist genres from the ``tracks`` table
    (populated by the batch artist-fetch step in the track ingestion pipeline).
    Tracks without stored genres fall back to ``"Other"``.

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

        # Pitch class → note name (C major scale naming)
        _KEY_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"]

        # Synthetic feature signature — matches _synthetic_features() fixed values
        _SYNTHETIC_ENERGY = 0.5
        _SYNTHETIC_VALENCE = 0.5
        _SYNTHETIC_DANCEABILITY = 0.5

        def _infer_features_source(feats: dict) -> str:
            """Infer the source of audio features.

            Checks the ``source`` column if present; otherwise detects synthetic
            data by matching the fixed mid-range values returned by
            ``_synthetic_features()``.
            """
            if "source" in feats and feats["source"]:
                return feats["source"]
            e = feats.get("energy")
            v = feats.get("valence")
            d = feats.get("danceability")
            if e == _SYNTHETIC_ENERGY and v == _SYNTHETIC_VALENCE and d == _SYNTHETIC_DANCEABILITY:
                return "synthetic"
            # No recognised source column and values don't match synthetic → real data
            return "spotify"

        # --- Build timeline + genre assignment ---
        timeline = []
        genre_counts: dict[str, int] = {}
        # subgenres: genre → set of subgenre strings (v1: empty since no artist data)
        genre_subgenres: dict[str, set] = {}
        key_counts: dict[str, int] = {}
        synthetic_count = 0

        for track in tracks:
            tid = track["id"]
            pos = track.get("position", 0)
            feats = features_by_id.get(tid, {})

            # Genre assignment — use stored artist genres if available
            raw_genres_str = track.get("genres")  # JSON string from DB, may be None
            if mock_genres:
                genre = _assign_mock_genre(pos)
            elif raw_genres_str:
                try:
                    raw_genres = _json.loads(raw_genres_str) if isinstance(raw_genres_str, str) else raw_genres_str
                except Exception:
                    raw_genres = []
                genre = classify_genre(raw_genres)
            else:
                genre = "Other"

            genre_counts[genre] = genre_counts.get(genre, 0) + 1
            genre_subgenres.setdefault(genre, set())

            # Key distribution — map pitch class int to note name
            raw_key = feats.get("key")
            key_name: str | None = None
            if raw_key is not None and 0 <= int(raw_key) <= 11:
                mode_suffix = "m" if feats.get("mode", 1) == 0 else ""
                key_name = _KEY_NAMES[int(raw_key)] + mode_suffix
                key_counts[key_name] = key_counts.get(key_name, 0) + 1

            # Determine features source (synthetic / rapidapi / spotify)
            features_source = _infer_features_source(feats) if feats else "synthetic"
            if features_source == "synthetic":
                synthetic_count += 1

            # Parse artist_names — stored as JSON string in DB
            raw_artists = track.get("artist_names", [])
            if isinstance(raw_artists, str):
                try:
                    import json as _j
                    raw_artists = _j.loads(raw_artists)
                except Exception:
                    raw_artists = []

            timeline.append(
                {
                    "position": pos,
                    "track_id": tid,
                    "track_name": track.get("name", tid),
                    "artist_names": raw_artists,
                    "album_art_url": track.get("album_art_url"),
                    "energy": feats.get("energy"),
                    "valence": feats.get("valence"),
                    "danceability": feats.get("danceability"),
                    "tempo": feats.get("tempo"),
                    "popularity": track.get("popularity"),
                    "key": key_name,
                    "genre": genre,
                    "features_source": features_source,
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

        # Sort key_distribution by note name for deterministic ordering
        key_distribution = dict(sorted(key_counts.items()))

        synthetic_fraction = synthetic_count / total_tracks if total_tracks > 0 else 0.0

        return {
            "playlist_id": playlist_id,
            "genre_breakdown": genre_breakdown,
            "timeline": timeline,
            "total_tracks": total_tracks,
            "key_distribution": key_distribution,
            "synthetic_fraction": synthetic_fraction,
        }

    finally:
        conn.close()
