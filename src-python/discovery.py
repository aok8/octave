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
    """Fetch recommended tracks from Spotify using the centroid as audio feature targets.

    NOTE: sp.recommendations() is a DEPRECATED Spotify endpoint and may return 400
    in production. Always mock with mocker.patch.object(spotipy.Spotify,
    'recommendations', ...) in tests — never use @responses.activate for this endpoint.

    Returns a list of track dicts with keys: id, name, artists, album, duration_ms.
    Returns an empty list on any error (best-effort — never blocks the session).
    """
    try:
        result = sp.recommendations(
            seed_tracks=[seed_track_id],
            limit=limit,
            target_energy=centroid.get("energy", DEFAULT_CENTROID["energy"]),
            target_valence=centroid.get("valence", DEFAULT_CENTROID["valence"]),
            target_danceability=centroid.get("danceability", DEFAULT_CENTROID["danceability"]),
            target_acousticness=centroid.get("acousticness", DEFAULT_CENTROID["acousticness"]),
        )
        tracks = []
        for item in (result or {}).get("tracks") or []:
            if item is None or not item.get("id"):
                continue
            artists = [a.get("name", "") for a in (item.get("artists") or [])]
            album = (item.get("album") or {}).get("name")
            images = (item.get("album") or {}).get("images") or []
            album_art_url = images[0]["url"] if images else None
            tracks.append(
                {
                    "id": item["id"],
                    "name": item.get("name", ""),
                    "artists": artists,
                    "album": album,
                    "album_art_url": album_art_url,
                    "duration_ms": item.get("duration_ms"),
                }
            )
        return tracks
    except Exception:
        return []
