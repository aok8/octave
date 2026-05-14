"""
routers/ai_router.py — AI Playlist Generation endpoints.

POST /ai/generate
    Generate a playlist from a text description using OpenRouter or Ollama,
    then resolve the suggested tracks via Spotify search.

POST /ai/key
    Store or clear the OpenRouter API key in the ai_config table.

GET /ai/status
    Return the current key status: "configured", "local", or null.
"""

import ai as ai_module
from db import get_ai_config, get_db, log_interaction, set_ai_config
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from spotify_client import get_client

router = APIRouter()


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------


class GenerateRequest(BaseModel):
    access_token: str
    prompt: str
    ai_key: str = ""  # empty string = use Ollama


class GenerateResponse(BaseModel):
    tracks: list[dict]
    provider: str  # "openrouter" | "ollama" | "error"


class KeyRequest(BaseModel):
    key: str  # empty string = use Ollama / clear key


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.post("/generate", response_model=GenerateResponse)
def generate_ai_playlist(body: GenerateRequest):
    """Generate a playlist from a text description.

    If ``ai_key`` is provided, OpenRouter is tried first with Ollama as
    fallback. If ``ai_key`` is empty, only Ollama is attempted.
    """
    # Validate prompt length
    if not body.prompt or len(body.prompt.strip()) == 0:
        raise HTTPException(status_code=422, detail="prompt must not be empty")
    if len(body.prompt) > 500:
        raise HTTPException(
            status_code=422, detail="prompt must be 500 characters or fewer"
        )

    sp = get_client(body.access_token)
    suggestions: list[dict] = []
    provider: str = "error"

    try:
        if body.ai_key:
            # Try OpenRouter first, fall back to Ollama
            try:
                suggestions = ai_module.generate_with_openrouter(
                    body.prompt, body.ai_key
                )
                provider = "openrouter"
            except Exception:
                try:
                    suggestions = ai_module.generate_with_ollama(body.prompt)
                    provider = "ollama"
                except Exception as ollama_exc:
                    raise HTTPException(
                        status_code=503,
                        detail=f"Both OpenRouter and Ollama failed: {ollama_exc}",
                    )
        else:
            # No API key — use Ollama only
            try:
                suggestions = ai_module.generate_with_ollama(body.prompt)
                provider = "ollama"
            except Exception as exc:
                raise HTTPException(
                    status_code=503,
                    detail=f"Ollama unavailable: {exc}",
                )

        tracks = ai_module.resolve_tracks(sp, suggestions)

        # Log the event
        conn = get_db()
        try:
            log_interaction(
                conn,
                "ai_playlist_generated",
                {
                    "provider": provider,
                    "track_count": len(tracks),
                    "prompt_length": len(body.prompt),
                },
            )
        finally:
            conn.close()

        return GenerateResponse(tracks=tracks, provider=provider)

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=503, detail=f"AI playlist generation failed: {exc}"
        )


@router.post("/key")
def set_ai_key(body: KeyRequest):
    """Store or clear the OpenRouter API key."""
    conn = get_db()
    try:
        set_ai_config(conn, "openrouter_api_key", body.key)
    finally:
        conn.close()
    return {"status": "ok"}


@router.get("/status")
def get_ai_status():
    """Return the current AI key status.

    Returns ``"configured"`` if a non-empty key is stored, ``"local"`` if the
    key is explicitly stored as an empty string, and ``null`` if no key has
    ever been set.
    """
    conn = get_db()
    try:
        value = get_ai_config(conn, "openrouter_api_key")
    finally:
        conn.close()

    if value is None:
        return {"status": None}
    if value == "":
        return {"status": "local"}
    return {"status": "configured"}
