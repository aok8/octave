"""
Tests for GET /auth/profile endpoint.

Acceptance criteria:
  - GET /auth/profile → 200, response contains "display_name" and "email" keys
"""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient


# ---------------------------------------------------------------------------
# Tests — GET /auth/profile
# ---------------------------------------------------------------------------


def test_get_profile(client: TestClient, tmp_db: str):
    """GET /auth/profile returns 200 with display_name and email keys."""
    resp = client.get("/auth/profile")

    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert "display_name" in data
    assert "email" in data
