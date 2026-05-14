"""
ai.py — AI playlist generation via OpenRouter API or local Ollama.

AI-free fallback: if no key and Ollama unreachable, returns an error.
Never calls Spotify recommendations (deprecated). Uses Spotify search
to resolve AI-suggested tracks into real Spotify track objects.
"""

import json

import requests

SYSTEM_PROMPT = (
    "You are a music expert. Given a playlist description, respond with ONLY a valid JSON array "
    "of exactly 10 tracks. Each object must have \"title\" and \"artist\" fields. No markdown, "
    "no explanation, just the JSON array.\n"
    'Example: [{"title": "Redbone", "artist": "Childish Gambino"}, ...]'
)


def generate_with_openrouter(
    prompt: str,
    api_key: str,
    model: str = "anthropic/claude-haiku-4-5",
) -> list[dict]:
    """Call OpenRouter chat completions API and return a list of track suggestions.

    Each suggestion is a dict with ``title`` and ``artist`` keys.
    Raises ``ValueError`` if the response cannot be parsed as a list of dicts.
    """
    url = "https://openrouter.ai/api/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://octave.app",
    }
    body = {
        "model": model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
        "max_tokens": 800,
    }

    response = requests.post(url, headers=headers, json=body, timeout=30)
    response.raise_for_status()

    try:
        content = response.json()["choices"][0]["message"]["content"]
        result = json.loads(content)
        if not isinstance(result, list):
            raise ValueError("Expected a JSON array from OpenRouter response")
        return result
    except (KeyError, IndexError, json.JSONDecodeError) as exc:
        raise ValueError(f"Failed to parse OpenRouter response: {exc}") from exc


def generate_with_ollama(
    prompt: str,
    model: str = "llama3.2",
) -> list[dict]:
    """Call local Ollama API and return a list of track suggestions.

    Each suggestion is a dict with ``title`` and ``artist`` keys.
    Raises ``ValueError`` on parse failure or connection error.
    """
    url = "http://localhost:11434/api/generate"
    body = {
        "model": model,
        "prompt": f"{SYSTEM_PROMPT}\n\nUser request: {prompt}",
        "stream": False,
    }

    try:
        response = requests.post(url, json=body, timeout=60)
        response.raise_for_status()
    except requests.exceptions.ConnectionError as exc:
        raise ValueError(f"Cannot reach local Ollama: {exc}") from exc

    try:
        content = response.json()["response"]
        result = json.loads(content)
        if not isinstance(result, list):
            raise ValueError("Expected a JSON array from Ollama response")
        return result
    except (KeyError, json.JSONDecodeError) as exc:
        raise ValueError(f"Failed to parse Ollama response: {exc}") from exc


def resolve_tracks(sp, suggestions: list[dict]) -> list[dict]:
    """Resolve AI-suggested track names/artists to real Spotify track objects.

    For each suggestion dict (``title``, ``artist``), searches Spotify and
    converts the first hit to our standard track dict shape. Suggestions that
    return no results are silently skipped.

    Returns a list of track dicts (may be shorter than the input list).
    """
    resolved = []
    for suggestion in suggestions:
        title = suggestion.get("title", "")
        artist = suggestion.get("artist", "")
        if not title or not artist:
            continue

        try:
            result = sp.search(
                q=f"track:{title} artist:{artist}",
                type="track",
                limit=1,
            )
            items = (result.get("tracks") or {}).get("items") or []
            if not items:
                continue

            track = items[0]
            artists = [a.get("name", "") for a in (track.get("artists") or [])]
            images = (track.get("album") or {}).get("images") or []
            album_art_url = images[0]["url"] if images else None

            resolved.append(
                {
                    "id": track["id"],
                    "name": track.get("name", ""),
                    "artist_names": artists,
                    "album_name": (track.get("album") or {}).get("name"),
                    "album_art_url": album_art_url,
                    "duration_ms": track.get("duration_ms"),
                }
            )
        except Exception:
            # Best-effort: skip tracks that fail to resolve
            continue

    return resolved
