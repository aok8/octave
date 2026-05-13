import sys
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import playlists, tracks, search
import uvicorn

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


@app.get("/health")
def health():
    return {"status": "ok", "version": "2.0.0"}


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    uvicorn.run(app, host="127.0.0.1", port=port)
