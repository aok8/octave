import logging
import sys
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import playlists, tracks, search, insights, refine, export
from routers.playlists import root_router as playlists_root_router
from routers.storage import router as storage_router
from routers.auth import router as auth_router
from routers.discovery import router as discovery_router
from routers.ai_router import router as ai_router
from routers.settings_api import router as settings_router
import uvicorn

# Configure logging so rapidapi_client and router debug output appears
# in the Tauri console (sidecar stdout/stderr is captured and prefixed
# with "sidecar:" in the Rust debug logs).
logging.basicConfig(
    level=logging.DEBUG,
    format="%(levelname)s [%(name)s] %(message)s",
    stream=sys.stderr,
)
# Quiet down overly verbose third-party loggers
logging.getLogger("uvicorn").setLevel(logging.WARNING)
logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("urllib3").setLevel(logging.WARNING)

app = FastAPI(title="Octave API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["tauri://localhost", "http://localhost:1420"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(playlists.router, prefix="/playlists", tags=["playlists"])
app.include_router(tracks.router, prefix="/tracks", tags=["tracks"])
app.include_router(search.router, prefix="/search", tags=["search"])
app.include_router(insights.router, prefix="/insights", tags=["insights"])
app.include_router(refine.router, prefix="/refine", tags=["refine"])
app.include_router(export.router, prefix="/export", tags=["export"])
app.include_router(storage_router, prefix="/storage", tags=["storage"])
app.include_router(auth_router, prefix="/auth", tags=["auth"])
app.include_router(discovery_router, prefix="/discovery", tags=["discovery"])
app.include_router(ai_router, prefix="/ai", tags=["ai"])
app.include_router(settings_router, prefix="/settings", tags=["settings"])
app.include_router(playlists_root_router, tags=["playlists"])


@app.get("/health")
def health():
    """Liveness + readiness check.

    Returns DB schema info so callers can verify that all migrations have been
    applied.  This is intentionally cheap (one PRAGMA per table) and safe to
    call frequently.

    ``status`` is:
      - ``"ok"``       — sidecar is running and DB is accessible (or not configured)
      - ``"degraded"`` — sidecar is running but DB exists at the configured path yet
                         cannot be opened / queried (genuine DB error)
    """
    import os
    schema: dict = {}
    db_error: str | None = None
    db_path = os.environ.get("OCTAVE_DB_PATH")

    if db_path:
        # DB is expected to be present — check schema.
        try:
            from db import get_db
            conn = get_db()
            try:
                for table in ("tracks", "playlists", "playlist_tracks", "audio_features",
                              "recently_used", "interaction_log", "discovery_sessions",
                              "ai_config"):
                    try:
                        cursor = conn.execute(f"PRAGMA table_info({table})")
                        schema[table] = [row[1] for row in cursor.fetchall()]
                    except Exception:
                        schema[table] = None  # table doesn't exist yet
            finally:
                conn.close()
        except Exception as exc:
            db_error = str(exc)
    # else: no DB path configured — that's fine for the health check (test envs).

    return {
        "status": "ok" if db_error is None else "degraded",
        "version": "2.0.0",
        **({"db_schema": schema} if db_path else {}),
        **({"db_path": db_path} if db_path else {}),
        **({"db_error": db_error} if db_error else {}),
    }


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    uvicorn.run(app, host="127.0.0.1", port=port)
