"""
db.py — SQLite helpers for the Octave Python sidecar.

Uses Python's built-in sqlite3 module (not SQLAlchemy) to avoid schema
conflicts with the Rust-managed sqlx migrations and to keep dependencies
minimal.

The DB path is provided via the OCTAVE_DB_PATH environment variable,
which Tauri sets when launching the sidecar.
"""

import os
import sqlite3
import time
from typing import Any, Dict, List, Optional


def get_db() -> sqlite3.Connection:
    """Return a SQLite connection to the shared Octave database.

    The path is read from the OCTAVE_DB_PATH environment variable.
    Raises RuntimeError if the variable is not set.
    Row factory is set to sqlite3.Row so callers get dict-like rows.
    """
    db_path = os.environ.get("OCTAVE_DB_PATH")
    if not db_path:
        raise RuntimeError(
            "OCTAVE_DB_PATH environment variable is not set. "
            "The Tauri shell plugin must set this before launching the sidecar."
        )
    conn = sqlite3.connect(db_path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


# ---------------------------------------------------------------------------
# User helpers
# ---------------------------------------------------------------------------


def upsert_user(conn: sqlite3.Connection, user: dict) -> None:
    """Insert or replace a user row."""
    conn.execute(
        """
        INSERT OR REPLACE INTO users (id, display_name, email, avatar_url)
        VALUES (:id, :display_name, :email, :avatar_url)
        """,
        {
            "id": user["id"],
            "display_name": user.get("display_name") or user["id"],
            "email": user.get("email"),
            "avatar_url": next(
                (img["url"] for img in (user.get("images") or []) if img.get("url")),
                None,
            ),
        },
    )
    conn.commit()


# ---------------------------------------------------------------------------
# Playlist helpers
# ---------------------------------------------------------------------------


def upsert_playlist(conn: sqlite3.Connection, playlist: Dict[str, Any]) -> None:
    """Insert or replace a playlist row.

    Expected keys: id, user_id, name, description, cover_url,
                   track_count, is_public, snapshot_id, cached_at.
    """
    conn.execute(
        """
        INSERT OR REPLACE INTO playlists
            (id, user_id, name, description, cover_url,
             track_count, is_public, snapshot_id, cached_at)
        VALUES
            (:id, :user_id, :name, :description, :cover_url,
             :track_count, :is_public, :snapshot_id, :cached_at)
        """,
        {
            "id": playlist["id"],
            "user_id": playlist["user_id"],
            "name": playlist["name"],
            "description": playlist.get("description"),
            "cover_url": playlist.get("cover_url"),
            "track_count": playlist.get("track_count", 0),
            "is_public": 1 if playlist.get("is_public") else 0,
            "snapshot_id": playlist.get("snapshot_id"),
            "cached_at": playlist.get("cached_at", int(time.time())),
        },
    )
    conn.commit()


def get_cached_playlists(
    conn: sqlite3.Connection, user_id: str
) -> List[Dict[str, Any]]:
    """Return all cached playlists for a user as a list of dicts."""
    cursor = conn.execute(
        "SELECT * FROM playlists WHERE user_id = ? ORDER BY name",
        (user_id,),
    )
    return [dict(row) for row in cursor.fetchall()]


# ---------------------------------------------------------------------------
# Track helpers
# ---------------------------------------------------------------------------


def upsert_track(conn: sqlite3.Connection, track: Dict[str, Any]) -> None:
    """Insert or replace a track row.

    artist_names is stored as a JSON array string.
    """
    import json

    artist_names = track.get("artist_names", [])
    if isinstance(artist_names, list):
        artist_names_str = json.dumps(artist_names)
    else:
        artist_names_str = artist_names  # already serialised

    conn.execute(
        """
        INSERT OR REPLACE INTO tracks
            (id, name, artist_names, album_name, album_art_url,
             duration_ms, popularity, cached_at)
        VALUES
            (:id, :name, :artist_names, :album_name, :album_art_url,
             :duration_ms, :popularity, :cached_at)
        """,
        {
            "id": track["id"],
            "name": track["name"],
            "artist_names": artist_names_str,
            "album_name": track.get("album_name"),
            "album_art_url": track.get("album_art_url"),
            "duration_ms": track.get("duration_ms"),
            "popularity": track.get("popularity"),
            "cached_at": track.get("cached_at", int(time.time())),
        },
    )
    conn.commit()


def upsert_playlist_track(
    conn: sqlite3.Connection,
    playlist_id: str,
    track_id: str,
    position: int,
    added_at: Optional[int] = None,
) -> None:
    """Insert or replace a playlist_tracks join row."""
    conn.execute(
        """
        INSERT OR REPLACE INTO playlist_tracks
            (playlist_id, track_id, position, added_at)
        VALUES (?, ?, ?, ?)
        """,
        (playlist_id, track_id, position, added_at),
    )
    conn.commit()


def get_cached_tracks(
    conn: sqlite3.Connection, playlist_id: str
) -> List[Dict[str, Any]]:
    """Return all cached tracks for a playlist, ordered by position."""
    cursor = conn.execute(
        """
        SELECT t.*, pt.position, pt.added_at
        FROM tracks t
        JOIN playlist_tracks pt ON t.id = pt.track_id
        WHERE pt.playlist_id = ?
        ORDER BY pt.position
        """,
        (playlist_id,),
    )
    return [dict(row) for row in cursor.fetchall()]


# ---------------------------------------------------------------------------
# Audio features helpers
# ---------------------------------------------------------------------------


def upsert_audio_features(
    conn: sqlite3.Connection, features: Dict[str, Any]
) -> None:
    """Insert or replace an audio_features row."""
    conn.execute(
        """
        INSERT OR REPLACE INTO audio_features
            (track_id, energy, tempo, valence, danceability, acousticness,
             instrumentalness, speechiness, loudness, key, mode,
             time_signature, cached_at)
        VALUES
            (:track_id, :energy, :tempo, :valence, :danceability,
             :acousticness, :instrumentalness, :speechiness, :loudness,
             :key, :mode, :time_signature, :cached_at)
        """,
        {
            "track_id": features["track_id"],
            "energy": features.get("energy"),
            "tempo": features.get("tempo"),
            "valence": features.get("valence"),
            "danceability": features.get("danceability"),
            "acousticness": features.get("acousticness"),
            "instrumentalness": features.get("instrumentalness"),
            "speechiness": features.get("speechiness"),
            "loudness": features.get("loudness"),
            "key": features.get("key"),
            "mode": features.get("mode"),
            "time_signature": features.get("time_signature"),
            "cached_at": features.get("cached_at", int(time.time())),
        },
    )
    conn.commit()


def get_cached_features(
    conn: sqlite3.Connection, track_ids: List[str]
) -> Dict[str, Dict[str, Any]]:
    """Return a dict of track_id -> features for the requested track IDs.

    Only IDs that exist in the cache are included in the result.
    """
    if not track_ids:
        return {}
    placeholders = ",".join("?" * len(track_ids))
    cursor = conn.execute(
        f"SELECT * FROM audio_features WHERE track_id IN ({placeholders})",
        track_ids,
    )
    return {row["track_id"]: dict(row) for row in cursor.fetchall()}


# ---------------------------------------------------------------------------
# Recently used helpers
# ---------------------------------------------------------------------------


def update_recently_used(conn: sqlite3.Connection, playlist_id: str) -> None:
    """Upsert the recently_used row for a playlist with the current timestamp."""
    conn.execute(
        """
        INSERT INTO recently_used (playlist_id, accessed_at)
        VALUES (?, ?)
        ON CONFLICT(playlist_id) DO UPDATE SET accessed_at = excluded.accessed_at
        """,
        (playlist_id, int(time.time())),
    )
    conn.commit()
