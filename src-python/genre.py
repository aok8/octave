"""
genre.py — Spotify genre string → Octave genre bucket classifier.

Maps arbitrary Spotify artist genre strings (e.g. "neo soul", "trap")
to one of 6 Octave genre buckets (or "Other" as fallback).

Public API
----------
GENRE_COLORS : dict[str, str]
    Maps bucket name → hex color string.

classify_genre(spotify_genres: list[str]) -> str
    Returns the single best-matching bucket name for a list of Spotify
    genre strings.

get_subgenre_labels(spotify_genres: list[str]) -> list[str]
    Returns up to 3 of the original Spotify genre strings that are most
    relevant (matched to a bucket), for use as sunburst sub-genre labels.
"""

from __future__ import annotations

# ---------------------------------------------------------------------------
# Genre buckets — order matters inside each list (most-specific first so
# that longer keyword matches win ties in classify_genre).
# ---------------------------------------------------------------------------

GENRE_COLORS: dict[str, str] = {
    "RnB": "#6A0DAD",
    "Neo-Soul": "#FF914D",
    "Hip-Hop": "#1DB9FF",
    "Chill Pop": "#FF6FAE",
    "Lo-Fi": "#4DB6AC",
    "Nu-Jazz": "#FFD93D",
    "Other": "#555555",
}

# Each entry is (keyword, bucket_name).  The list is ordered so that more
# specific / longer keywords appear before shorter ones to break ties.
_KEYWORD_RULES: list[tuple[str, str]] = [
    # Neo-Soul — checked before RnB so "neo soul" beats "soul"
    ("neo soul", "Neo-Soul"),
    ("alternative r&b", "Neo-Soul"),
    ("indie soul", "Neo-Soul"),
    ("bedroom soul", "Neo-Soul"),
    # RnB
    ("rhythm and blues", "RnB"),
    ("contemporary r&b", "RnB"),
    ("urban contemporary", "RnB"),
    ("r&b", "RnB"),
    ("rnb", "RnB"),
    ("soul", "RnB"),  # broad "soul" maps to RnB (neo soul caught above)
    # Hip-Hop — most-specific first
    ("conscious hip hop", "Hip-Hop"),
    ("gangsta rap", "Hip-Hop"),
    ("boom bap", "Hip-Hop"),
    ("hip-hop", "Hip-Hop"),
    ("hip hop", "Hip-Hop"),
    ("rap", "Hip-Hop"),
    ("trap", "Hip-Hop"),
    ("drill", "Hip-Hop"),
    # Lo-Fi — before Chill Pop so "lo-fi pop" → Lo-Fi
    ("lo-fi hip hop", "Lo-Fi"),
    ("lo-fi beats", "Lo-Fi"),
    ("study beats", "Lo-Fi"),
    ("chillhop", "Lo-Fi"),
    ("lo-fi", "Lo-Fi"),
    ("lofi", "Lo-Fi"),
    ("lo fi", "Lo-Fi"),
    # Chill Pop
    ("bedroom pop", "Chill Pop"),
    ("chill pop", "Chill Pop"),
    ("dream pop", "Chill Pop"),
    ("indie pop", "Chill Pop"),
    ("synth pop", "Chill Pop"),
    ("chillwave", "Chill Pop"),
    ("lo-fi pop", "Chill Pop"),
    # Nu-Jazz — most-specific first
    ("jazz fusion", "Nu-Jazz"),
    ("jazz rap", "Nu-Jazz"),
    ("acid jazz", "Nu-Jazz"),
    ("future jazz", "Nu-Jazz"),
    ("bossa nova", "Nu-Jazz"),
    ("nu jazz", "Nu-Jazz"),
    ("jazz pop", "Nu-Jazz"),
    ("jazz", "Nu-Jazz"),
]


def _best_match(genre_string: str) -> tuple[str, int] | tuple[None, int]:
    """Return (bucket_name, keyword_length) for the longest keyword match.

    Returns (None, 0) when no keyword matches.
    """
    lower = genre_string.lower()
    best_bucket: str | None = None
    best_len = 0
    for keyword, bucket in _KEYWORD_RULES:
        if keyword in lower and len(keyword) > best_len:
            best_bucket = bucket
            best_len = len(keyword)
    return best_bucket, best_len


def classify_genre(spotify_genres: list[str]) -> str:
    """Map a list of Spotify genre strings to a single Octave bucket name.

    Parameters
    ----------
    spotify_genres:
        List of raw Spotify genre strings, e.g.
        ``["neo soul", "quiet storm", "urban contemporary"]``.

    Returns
    -------
    str
        One of ``"RnB"``, ``"Neo-Soul"``, ``"Hip-Hop"``, ``"Chill Pop"``,
        ``"Lo-Fi"``, ``"Nu-Jazz"``, or ``"Other"``.

    Algorithm
    ---------
    For each genre string, find the longest matching keyword.  Across all
    genre strings, return the bucket whose single longest keyword match is
    greatest.  If no keyword matches at all, return ``"Other"``.
    """
    if not spotify_genres:
        return "Other"

    overall_best_bucket: str | None = None
    overall_best_len = 0

    for genre_str in spotify_genres:
        bucket, length = _best_match(genre_str)
        if bucket is not None and length > overall_best_len:
            overall_best_bucket = bucket
            overall_best_len = length

    return overall_best_bucket if overall_best_bucket is not None else "Other"


def get_subgenre_labels(spotify_genres: list[str]) -> list[str]:
    """Return up to 3 Spotify genre strings that matched a known bucket.

    The most relevant genres (those with the longest keyword match) are
    returned first.  Unknown genres (no keyword match) are excluded.

    Parameters
    ----------
    spotify_genres:
        List of raw Spotify genre strings.

    Returns
    -------
    list[str]
        Up to 3 of the input strings that matched at least one keyword,
        ordered by match length descending (most specific first).
    """
    scored: list[tuple[str, int]] = []
    for genre_str in spotify_genres:
        _, length = _best_match(genre_str)
        if length > 0:
            scored.append((genre_str, length))

    # Sort by match quality descending, preserve original string
    scored.sort(key=lambda x: x[1], reverse=True)
    return [g for g, _ in scored[:3]]
