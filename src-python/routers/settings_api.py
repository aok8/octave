"""
routers/settings_api.py — Settings endpoints for API key management.

GET  /settings/rapidapi-key/status
     Return whether a RapidAPI key is configured.

POST /settings/rapidapi-key
     Store a RapidAPI key in the ai_config table.

DELETE /settings/rapidapi-key
     Remove the RapidAPI key from the ai_config table.

POST /settings/test-rapidapi
     Test a RapidAPI key by making a live call to the SoundNet endpoint.
"""

from typing import Optional

import rapidapi_client
from db import get_ai_config, get_db, set_ai_config
from fastapi import APIRouter
from pydantic import BaseModel, field_validator

router = APIRouter()

_TEST_TRACK_ID = "3z0JwddAR5GASTxnKExIw1"


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------


class RapidApiKeyRequest(BaseModel):
    key: str

    @field_validator("key")
    @classmethod
    def key_must_be_non_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("key must be a non-empty string")
        return v


class TestRapidApiRequest(BaseModel):
    key: str


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.get("/rapidapi-key/status")
def get_rapidapi_key_status():
    """Return whether a RapidAPI key is configured.

    Returns:
        {"configured": bool, "source": "rapidapi"|"synthetic"}
    """
    conn = get_db()
    try:
        value = get_ai_config(conn, "rapidapi_key")
    finally:
        conn.close()

    configured = bool(value and value.strip())
    return {
        "configured": configured,
        "source": "rapidapi" if configured else "synthetic",
    }


@router.post("/rapidapi-key")
def save_rapidapi_key(body: RapidApiKeyRequest):
    """Store a RapidAPI key in the ai_config table.

    Returns:
        {"ok": true}
    """
    conn = get_db()
    try:
        set_ai_config(conn, "rapidapi_key", body.key)
    finally:
        conn.close()
    return {"ok": True}


@router.delete("/rapidapi-key")
def delete_rapidapi_key():
    """Remove the RapidAPI key from the ai_config table.

    Returns:
        {"ok": true}
    """
    conn = get_db()
    try:
        conn.execute("DELETE FROM ai_config WHERE key = ?", ("rapidapi_key",))
        conn.commit()
    finally:
        conn.close()
    return {"ok": True}


@router.post("/test-rapidapi")
def test_rapidapi_key(body: TestRapidApiRequest):
    """Test a RapidAPI key by making a live call to the SoundNet endpoint.

    Uses a known Spotify track ID as the test payload.

    Returns:
        {"ok": bool, "error": str|null}
    """
    try:
        results = rapidapi_client.get_features_batch([_TEST_TRACK_ID], body.key)
        if results and ("energy" in results[0] or "tempo" in results[0]):
            return {"ok": True, "error": None}
        return {"ok": False, "error": "No valid response data returned from API"}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}
