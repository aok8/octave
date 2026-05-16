"""
rapidapi_client.py — SoundNet Track Analysis API client.

Fetches audio features for Spotify tracks via the RapidAPI SoundNet endpoint.
Used as a fallback when Spotify's audio-features endpoint is unavailable (403/400).

Normalization:
  - SoundNet returns 0-100 scale; we store 0-1 (divide by 100)
  - SoundNet "happiness" field → our "valence"
  - SoundNet key notation ("F# minor") → pitch class int (0-11) + mode (0=minor, 1=major)
"""

import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Optional

import requests
import requests.exceptions

RAPIDAPI_HOST = "track-analysis.p.rapidapi.com"

_KEY_TO_PITCH_CLASS: dict = {
    "C": 0,
    "C#": 1,
    "Db": 1,
    "D": 2,
    "D#": 3,
    "Eb": 3,
    "E": 4,
    "F": 5,
    "F#": 6,
    "Gb": 6,
    "G": 7,
    "G#": 8,
    "Ab": 8,
    "A": 9,
    "A#": 10,
    "Bb": 10,
    "B": 11,
}


def _normalize_key(raw_key: str) -> tuple:
    """Parse a key string like "F# minor" into (pitch_class, mode).

    Returns:
        (pitch_class, mode) where:
          - pitch_class is 0-11 (None if unparseable)
          - mode is 1 (major) or 0 (minor), None if no mode given
    """
    if not raw_key:
        return (None, None)

    parts = raw_key.strip().split()
    if not parts:
        return (None, None)

    note = parts[0]
    pitch_class = _KEY_TO_PITCH_CLASS.get(note)
    if pitch_class is None:
        return (None, None)

    mode: Optional[int] = None
    if len(parts) >= 2:
        mode_str = parts[1].lower()
        if mode_str == "major":
            mode = 1
        elif mode_str == "minor":
            mode = 0

    return (pitch_class, mode)


def _normalize_response(track_id: str, raw: dict) -> dict:
    """Map a SoundNet API response to our internal audio features schema.

    SoundNet returns 0-100 scale for most fields; we normalize to 0-1.
    Maps "happiness" to "valence".
    Parses key notation string to pitch class int + mode int.
    """
    pitch_class, mode = _normalize_key(raw.get("key", ""))

    # Divide 0-100 fields by 100 to get 0-1 scale
    def _scale(val) -> Optional[float]:
        if val is None:
            return None
        try:
            return float(val) / 100.0
        except (TypeError, ValueError):
            return None

    return {
        "track_id": track_id,
        "energy": _scale(raw.get("energy")),
        "tempo": raw.get("tempo"),  # already in BPM, correct scale
        "valence": _scale(raw.get("happiness")),
        "danceability": _scale(raw.get("danceability")),
        "acousticness": _scale(raw.get("acousticness")),
        "instrumentalness": _scale(raw.get("instrumentalness")),
        "speechiness": _scale(raw.get("speechiness")),
        "loudness": raw.get("loudness"),  # already in dB, correct scale
        "key": pitch_class,
        "mode": mode,
        "time_signature": raw.get("time_signature"),
        "cached_at": int(time.time()),
    }


def probe_endpoint(api_key: str, track_id: str) -> dict:
    """Make a single diagnostic call to the RapidAPI endpoint and return raw results.

    Unlike get_features_batch, this function does NOT swallow errors — it surfaces
    the HTTP status code and raw response body so callers can show meaningful
    diagnostics to the user.

    Returns:
        {
            "ok": bool,
            "status": int | None,
            "body": dict | None,
            "error": str | None,
        }
    """
    headers = {
        "x-rapidapi-key": api_key,
        "x-rapidapi-host": RAPIDAPI_HOST,
    }
    try:
        response = requests.get(
            f"https://{RAPIDAPI_HOST}/pktx/spotify/{track_id}",
            headers=headers,
            timeout=15,
        )
        try:
            body = response.json()
        except Exception:
            body = {"raw": response.text[:500]}

        if response.status_code == 200 and (
            body.get("energy") is not None or body.get("tempo") is not None
        ):
            return {"ok": True, "status": 200, "body": body, "error": None}

        # Return diagnostic info so the caller can show a useful error
        return {
            "ok": False,
            "status": response.status_code,
            "body": body,
            "error": (
                f"API returned HTTP {response.status_code}. "
                f"Response: {str(body)[:200]}"
            ),
        }
    except requests.exceptions.Timeout:
        return {"ok": False, "status": None, "body": None, "error": "Request timed out (15s)"}
    except Exception as exc:
        return {"ok": False, "status": None, "body": None, "error": str(exc)}


def _fetch_single(track_id: str, headers: dict) -> Optional[dict]:
    """Fetch audio features for one track. Returns None on any error or non-200."""
    try:
        response = requests.get(
            f"https://{RAPIDAPI_HOST}/pktx/spotify/{track_id}",
            headers=headers,
            timeout=10,
        )
        if response.status_code != 200:
            return None
        raw = response.json()
        return _normalize_response(track_id, raw)
    except Exception:
        return None


def get_features_batch(track_ids: list, api_key: str) -> list:
    """Fetch audio features for a list of Spotify track IDs via SoundNet RapidAPI.

    SoundNet API is per-track; requests are made in parallel (up to 10
    concurrent workers) to avoid the latency of sequential calls.
    Per-track errors are swallowed silently (best-effort). Tracks that fail
    are simply omitted from the returned list.

    Args:
        track_ids: List of Spotify track ID strings.
        api_key: RapidAPI key for authentication.

    Returns:
        List of normalized feature dicts (one per successfully fetched track).
    """
    if not track_ids:
        return []

    headers = {
        "x-rapidapi-key": api_key,
        "x-rapidapi-host": RAPIDAPI_HOST,
    }

    results: list = []
    max_workers = min(len(track_ids), 10)
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {
            executor.submit(_fetch_single, tid, headers): tid
            for tid in track_ids
        }
        for future in as_completed(futures):
            result = future.result()
            if result is not None:
                results.append(result)

    return results
