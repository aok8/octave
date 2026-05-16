"""
discovery.py — AI-free track discovery using cosine similarity + adaptive centroid.

The centroid tracks the mean audio feature vector of all liked tracks in a session.
On each feedback step, the centroid is updated with an exponential moving average (alpha=0.3).
New recommendations first try the local cosine-similarity engine over cached audio features.
When the cache is too sparse (< 3 results), it falls back to Spotify artist-search.
"""

import random

DEFAULT_CENTROID = {
    "energy": 0.5,
    "valence": 0.5,
    "danceability": 0.5,
    "tempo": 120.0,
    "acousticness": 0.3,
}

_CENTROID_KEYS = ("energy", "valence", "danceability", "tempo", "acousticness")


def update_centroid(centroid: dict, liked_features: dict, alpha: float = 0.3) -> dict:
    """Return a new centroid updated toward liked_features using EMA.

    For each key in _CENTROID_KEYS:
        new_value = (1 - alpha) * centroid[key] + alpha * liked_features[key]

    Keys missing from liked_features are carried forward unchanged.
    """
    updated = dict(centroid)
    for key in _CENTROID_KEYS:
        if key in liked_features and liked_features[key] is not None:
            old_val = float(centroid.get(key, DEFAULT_CENTROID.get(key, 0.5)))
            new_val = float(liked_features[key])
            updated[key] = (1.0 - alpha) * old_val + alpha * new_val
    return updated


def centroid_from_features(audio_features: dict) -> dict:
    """Extract the 5 centroid fields from a Spotify audio_features response dict.

    Returns a dict with exactly the keys in _CENTROID_KEYS.
    Missing fields fall back to DEFAULT_CENTROID values.
    """
    result = {}
    for key in _CENTROID_KEYS:
        val = audio_features.get(key)
        if val is not None:
            result[key] = float(val)
        else:
            result[key] = DEFAULT_CENTROID[key]
    return result


def get_discovery_tracks(sp, seed_track_id: str, centroid: dict, limit: int = 5, conn=None) -> list:
    """Fetch tracks similar to the seed track for discovery.

    Strategy (in order of preference):
    1. Cosine similarity over cached audio features (``conn`` must be provided).
       If ``conn`` is None or fewer than 3 similar tracks are found, falls through.
    2. Artist-search fallback: looks up the seed track's artist and returns
       other tracks by that artist via Spotify catalog search.

    ``centroid`` is accepted for API compatibility but is not used directly in
    the similarity query (the engine uses stored per-track feature vectors).

    Returns a list of track dicts with keys: id, name, artists, album,
    album_art_url, duration_ms.  Always returns an empty list on error —
    never blocks the discovery session.
    """
    # ------------------------------------------------------------------
    # 1. Try cosine-similarity over cached audio features
    # ------------------------------------------------------------------
    if conn is not None:
        try:
            from similarity import find_similar_tracks

            similar = find_similar_tracks(seed_track_id, conn, limit=limit + 5)
            if len(similar) >= 3:
                ids = [r["track_id"] for r in similar]
                sampled = random.sample(ids, min(limit, len(ids)))
                # Return minimal dicts — caller (_format_track) only needs `id`
                return [{"id": tid, "name": "", "artists": [], "album": None, "album_art_url": None, "duration_ms": None} for tid in sampled]
        except Exception:
            pass  # Fall through to artist-search

    # ------------------------------------------------------------------
    # 2. Artist-search fallback
    # ------------------------------------------------------------------
    try:
        seed = sp.track(seed_track_id)
        artists = seed.get("artists") or []
        if not artists:
            return []
        artist_name = artists[0].get("name", "")
        if not artist_name:
            return []

        result = sp.search(q=f'artist:"{artist_name}"', type="track", limit=limit + 1)
        tracks = []
        for item in (result.get("tracks") or {}).get("items") or []:
            if item is None or not item.get("id"):
                continue
            if item["id"] == seed_track_id:
                continue  # skip seed track itself
            artist_names = [a.get("name", "") for a in (item.get("artists") or [])]
            album = (item.get("album") or {}).get("name")
            images = (item.get("album") or {}).get("images") or []
            album_art_url = images[0]["url"] if images else None
            tracks.append(
                {
                    "id": item["id"],
                    "name": item.get("name", ""),
                    "artists": artist_names,
                    "album": album,
                    "album_art_url": album_art_url,
                    "duration_ms": item.get("duration_ms"),
                }
            )
        return tracks[:limit]
    except Exception:
        return []
