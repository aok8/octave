"""
spotify_client.py — Authenticated Spotipy client factory.

Tokens are passed in per-request from the Tauri IPC bridge.
The OS keychain managed by Rust is the source of truth for tokens;
Python never stores them.
"""

import spotipy


def get_client(access_token: str) -> spotipy.Spotify:
    """Return an authenticated Spotipy client for a given access token."""
    return spotipy.Spotify(auth=access_token)
