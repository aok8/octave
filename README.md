# Octave

A dark-themed desktop music playlist curator with fine-tuned control over playlist creation.

> *Find your flow.*

Octave lets you build playlists from seed tracks or existing playlists, visualize your music through interactive genre/mood insights, refine recommendations using audio feature sliders, and export directly to Spotify.

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop shell | [Tauri v2](https://tauri.app) (Rust + WebView2) |
| Frontend | React 18 + TypeScript + Vite + TailwindCSS v3 + Framer Motion + D3.js |
| Python sidecar | FastAPI + Spotipy + SQLite |
| Auth | Spotify OAuth PKCE — tokens stored in OS keychain |
| AI (V2) | OpenRouter + Ollama (local) |

## Project Status

| Sprint | Focus | Status |
|---|---|---|
| Sprint 1 | Tauri scaffold, Spotify auth (PKCE), SQLite schema, Python sidecar | ✅ Done |
| Sprint 2 | Playlist/track/audio-features pipeline, SQLite cache, UI component library | ✅ Done |
| Sprint 3 | Home screen, Seed flows, D3 Insights charts (donut + stacked area) | ✅ Done |
| Sprint 4 | Refinement screen (7 sliders + genre filter/boost), Export to Spotify | ✅ Done |
| Sprint 5 | Settings, accessibility, packaging (Windows + Linux), polish | 🔄 In Progress |

**Test coverage**: 86 Python pytest · 79 Vitest (11 test files) — all passing on `sprint/5-settings-polish`.

## Features

- **Seed Playlist** — browse your Spotify library, select a playlist, view full tracklist
- **Seed Song** — search Spotify catalog, pick a track, get AI-powered recommendations
- **Insights** — interactive D3 donut chart (genre breakdown) + stacked area chart (mood/energy flow)
- **Refinement** — 7 audio-feature sliders (energy, tempo, valence, danceability, acousticness, instrumentalness, popularity), genre filter/boost via donut clicks, live track preview with position deltas
- **Export** — save refined playlist to Spotify as a new playlist or overwrite an existing one
- **Settings** — Spotify account info, logout, database export/import, app version
- **AI Prompt** — placeholder screen for V2 AI playlist generation (Coming Soon)

## Getting Started

### Prerequisites

- [Rust](https://rustup.rs/) (stable)
- [Node.js](https://nodejs.org/) 18+
- Python 3.11+
- [Tauri CLI v2](https://tauri.app/start/prerequisites/)

### Development

```bash
# Install frontend deps
npm install

# Install Python sidecar deps
pip install -r src-python/requirements.txt

# Run Tauri dev mode (launches frontend + Rust shell + Python sidecar)
npm run tauri dev
```

### Python sidecar (standalone)

```bash
cd src-python
python main.py        # starts FastAPI on port 8000
```

### Tests

```bash
# Python sidecar tests (86 tests)
cd src-python
python -m pytest tests/ -v

# Frontend component + screen tests (79 tests)
npx vitest run
```

## Architecture

```
┌─────────────────────────────────────────┐
│  Tauri Shell (Rust)                     │
│  • Spotify OAuth PKCE                   │
│  • OS keychain (token storage)          │
│  • SQLite migrations (sqlx)             │
│  • Python sidecar lifecycle             │
│  • IPC commands → Python sidecar        │
└────────────┬────────────────────────────┘
             │ IPC (Tauri invoke)
┌────────────▼────────────────────────────┐
│  React Frontend (TypeScript/Vite)       │
│  • Home, SeedPlaylist, SeedSong         │
│  • Insights (D3 donut + area charts)    │
│  • Refinement (sliders + genre donut)   │
│  • Export modal                         │
│  • Settings, AI Prompt placeholder      │
│  • Framer Motion page transitions       │
└────────────┬────────────────────────────┘
             │ HTTP (localhost:8000)
┌────────────▼────────────────────────────┐
│  Python Sidecar (FastAPI)               │
│  • GET  /playlists          (SWR cache) │
│  • GET  /playlists/{id}/tracks          │
│  • GET  /tracks/audio-features          │
│  • GET  /search/tracks                  │
│  • GET  /search/recommendations         │
│  • GET  /insights/{playlist_id}         │
│  • POST /refine                         │
│  • POST /export/new                     │
│  • POST /export/overwrite/{id}          │
│  • POST /auth/logout                    │
│  • GET  /auth/profile                   │
│  • POST /storage/export                 │
│  • POST /storage/import                 │
│  • SQLite read/write (shared DB)        │
└─────────────────────────────────────────┘
```

## License

MIT
