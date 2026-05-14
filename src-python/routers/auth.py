"""
routers/auth.py — Authentication-related endpoints.

POST /auth/logout
    Signal the backend that the user is logging out.  Token clearing is
    handled by the Tauri keychain; this endpoint acknowledges the logout
    and can be extended to clear server-side session data if needed.

GET /auth/profile
    Return basic profile information for the currently authenticated user.
    In this sprint the values are read from well-known defaults; a future
    revision will look them up from the users table in SQLite.
"""

from __future__ import annotations

from fastapi import APIRouter

router = APIRouter()


@router.post("/logout")
def logout():
    """Acknowledge a logout request.

    Token clearing is handled by the Tauri keychain (OS credential store).
    This endpoint exists so the frontend can call a single IPC command that
    covers both keychain cleanup (Rust side) and any future server-side
    session teardown (Python side).

    Returns
    -------
    ``{"status": "ok"}``
    """
    return {"status": "ok"}


@router.get("/profile")
def get_profile():
    """Return the authenticated user's profile.

    Returns
    -------
    ``{"display_name": "...", "email": "..."}``
    """
    return {"display_name": "Alain K.", "email": "aokouassi@gmail.com"}
