"""
discovery.py — AI-free track discovery using Spotify recommendations + adaptive centroid.

The centroid tracks the mean audio feature vector of all liked tracks in a session.
On each feedback step, the centroid is updated with an exponential moving average (alpha=0.3).
New recommendations are requested from Spotify using the centroid as audio feature targets.
"""

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


def get_discovery_tracks(sp, seed_track_id: str, centroid: dict, limit: int = 5) -> list:
    """Fetch tracks by the seed track's primary artist for discovery.

    Replaces the deprecated sp.recommendations() with a search-based approach:
    looks up the seed track's artist, then searches for other tracks by that
    artist. centroid is accepted for API compatibility but not used in the query.

    Returns a list of track dicts with keys: id, name, artists, album, duration_ms.
    Returns an empty list on any error — never blocks the discovery session.
    """
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
