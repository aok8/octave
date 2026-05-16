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


def get_db_path() -> str:
    """Return the path to the Octave SQLite database.

    Reads OCTAVE_DB_PATH environment variable, falling back to "octave.db"
    in the current working directory.
    """
    return os.environ.get("OCTAVE_DB_PATH", "octave.db")


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

    artist_names, artist_ids, and genres are stored as JSON array strings.
    """
    import json

    artist_names = track.get("artist_names", [])
    if isinstance(artist_names, list):
        artist_names_str = json.dumps(artist_names)
    else:
        artist_names_str = artist_names  # already serialised

    artist_ids = track.get("artist_ids", [])
    if isinstance(artist_ids, list):
        artist_ids_str = json.dumps(artist_ids)
    else:
        artist_ids_str = artist_ids  # already serialised

    genres = track.get("genres", [])
    if isinstance(genres, list):
        genres_str = json.dumps(genres)
    else:
        genres_str = genres  # already serialised

    conn.execute(
        """
        INSERT OR REPLACE INTO tracks
            (id, name, artist_names, artist_ids, genres, album_name, album_art_url,
             duration_ms, popularity, cached_at)
        VALUES
            (:id, :name, :artist_names, :artist_ids, :genres, :album_name, :album_art_url,
             :duration_ms, :popularity, :cached_at)
        """,
        {
            "id": track["id"],
            "name": track["name"],
            "artist_names": artist_names_str,
            "artist_ids": artist_ids_str,
            "genres": genres_str,
            "album_name": track.get("album_name"),
            "album_art_url": track.get("album_art_url"),
            "duration_ms": track.get("duration_ms"),
            "popularity": track.get("popularity"),
            "cached_at": track.get("cached_at", int(time.time())),
        },
    )
    conn.commit()


def update_track_genres(conn: sqlite3.Connection, track_id: str, genres: list) -> None:
    """Update the genres JSON for a cached track (called after artist batch-fetch)."""
    import json
    conn.execute(
        "UPDATE tracks SET genres = ? WHERE id = ?",
        (json.dumps(genres), track_id),
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
    """Insert or replace an audio_features row.

    The ``source`` column distinguishes real data (``'rapidapi'``,
    ``'spotify'``) from synthetic fallback values (``'synthetic'``).
    This lets the cache layer skip stale synthetic entries and re-fetch
    when a RapidAPI key becomes available.
    """
    conn.execute(
        """
        INSERT OR REPLACE INTO audio_features
            (track_id, energy, tempo, valence, danceability, acousticness,
             instrumentalness, speechiness, loudness, key, mode,
             time_signature, cached_at, source)
        VALUES
            (:track_id, :energy, :tempo, :valence, :danceability,
             :acousticness, :instrumentalness, :speechiness, :loudness,
             :key, :mode, :time_signature, :cached_at, :source)
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
            "source": features.get("source", "synthetic"),
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


# ---------------------------------------------------------------------------
# Interaction log helpers
# ---------------------------------------------------------------------------


def log_interaction(
    conn: sqlite3.Connection, event_type: str, payload: dict
) -> None:
    """Append a row to interaction_log.

    The schema stores optional ``playlist_id`` and ``track_id`` columns as
    well as a free-form ``event_data`` TEXT column (JSON).  We extract known
    keys from *payload* into their dedicated columns and store the full dict
    as JSON in ``event_data`` for future-proofing.
    """
    import json

    conn.execute(
        """
        INSERT INTO interaction_log
            (event_type, playlist_id, track_id, event_data, created_at)
        VALUES (?, ?, ?, ?, ?)
        """,
        (
            event_type,
            payload.get("playlist_id"),
            payload.get("track_id"),
            json.dumps(payload),
            int(time.time()),
        ),
    )
    conn.commit()


# ---------------------------------------------------------------------------
# Discovery session helpers
# ---------------------------------------------------------------------------


def create_discovery_session(
    conn: sqlite3.Connection,
    session_id: str,
    user_id: str,
    seed_track_id: str,
    centroid_json: str,
) -> None:
    """Insert a new discovery_sessions row."""
    conn.execute(
        """
        INSERT INTO discovery_sessions
            (id, user_id, seed_track_id, centroid, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'active', strftime('%s','now'), strftime('%s','now'))
        """,
        (session_id, user_id, seed_track_id, centroid_json),
    )
    conn.commit()


def update_discovery_centroid(
    conn: sqlite3.Connection,
    session_id: str,
    centroid_json: str,
) -> None:
    """Update the centroid JSON for a discovery session."""
    conn.execute(
        """
        UPDATE discovery_sessions
        SET centroid = ?, updated_at = strftime('%s','now')
        WHERE id = ?
        """,
        (centroid_json, session_id),
    )
    conn.commit()


def end_discovery_session(conn: sqlite3.Connection, session_id: str) -> None:
    """Mark a discovery session as ended."""
    conn.execute(
        """
        UPDATE discovery_sessions
        SET status = 'ended', updated_at = strftime('%s','now')
        WHERE id = ?
        """,
        (session_id,),
    )
    conn.commit()


def get_discovery_session(conn: sqlite3.Connection, session_id: str) -> Optional[Dict[str, Any]]:
    """Return a discovery_sessions row as a dict, or None if not found."""
    cursor = conn.execute(
        "SELECT * FROM discovery_sessions WHERE id = ?",
        (session_id,),
    )
    row = cursor.fetchone()
    return dict(row) if row else None


def get_recently_used(conn: sqlite3.Connection, limit: int = 10) -> list:
    """Return recently used playlists ordered by access time descending."""
    cursor = conn.execute(
        """
        SELECT ru.playlist_id, ru.accessed_at, p.name, p.cover_url, p.track_count
        FROM recently_used ru
        LEFT JOIN playlists p ON ru.playlist_id = p.id
        ORDER BY ru.accessed_at DESC
        LIMIT ?
        """,
        (limit,),
    )
    return [dict(row) for row in cursor.fetchall()]


# ---------------------------------------------------------------------------
# AI config helpers
# ---------------------------------------------------------------------------


def get_ai_config(conn: sqlite3.Connection, key: str) -> Optional[str]:
    """Return the value for an ai_config key, or None if not set."""
    cursor = conn.execute(
        "SELECT value FROM ai_config WHERE key = ?",
        (key,),
    )
    row = cursor.fetchone()
    return row["value"] if row else None


def set_ai_config(conn: sqlite3.Connection, key: str, value: str) -> None:
    """Insert or replace an ai_config row."""
    conn.execute(
        """
        INSERT INTO ai_config (key, value, updated_at)
        VALUES (?, ?, strftime('%s','now'))
        ON CONFLICT(key) DO UPDATE SET value = excluded.value,
                                       updated_at = excluded.updated_at
        """,
        (key, value),
    )
    conn.commit()
