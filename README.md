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
| Sprint 5 | Settings, AI Prompt placeholder, storage/auth endpoints | ✅ Done |
| Sprint 6 | Accessibility pass, Home IPC wiring, Inter font, packaging config, logout | ✅ Done |
| Sprint 7 | (previous sprint work) | ✅ Done |
| Sprint 8 | Discovery Mode (swipe cards, keyboard nav, queue drawer, export), Settings AI status | ✅ Done |
| Sprint 9 | AI Playlist Generation (OpenRouter + Ollama), Discovery seed wiring (R-11) | ✅ Done |
| Sprint 10 | Fix deprecated Spotify endpoints (audio features fallback, artist-search recommendations) | ✅ Done |
| Sprint 11 | CI Rust check, Inter font bundling, MIT LICENSE, NSIS path fix | ✅ Done |
| Sprint 12 | GET /health test, WCAG AA axe-core audit (9 screens, 0 violations), Cargo.lock | ✅ Done |
| Sprint 13 | End-to-end IPC smoke tests: 10 Rust lib tests (wiremock), Python cross-endpoint integration test, CI upgrade to cargo test --lib | ✅ Done |
| Sprint 14 | Advanced Insights (F-13): Tempo Map + Key Distribution charts, extended /insights API, fixed IPC type mismatch | ✅ Done |

**Test coverage**: 127 Python pytest · 131 Vitest (17 test files) — all passing on `master`.

## Features

- **Seed Playlist** — browse your Spotify library, select a playlist, view full tracklist
- **Seed Song** — search Spotify catalog, pick a track, get AI-powered recommendations
- **Insights** — interactive D3 donut chart (genre breakdown) + stacked area chart (mood/energy flow)
- **Refinement** — 7 audio-feature sliders (energy, tempo, valence, danceability, acousticness, instrumentalness, popularity), genre filter/boost via donut clicks, live track preview with position deltas; graceful fallback to mid-range values when Spotify's deprecated audio-features endpoint is unavailable
- **Export** — save refined playlist to Spotify as a new playlist or overwrite an existing one
- **Settings** — Spotify account info, logout (keychain clear), database export/import, app version
- **Discovery Mode** — swipe-card discovery session: keep (→) or skip (←) tracks one at a time, keyboard shortcuts, queue drawer, export kept tracks to Spotify
- **AI Playlist Generation** — natural language prompt → Spotify track search → export; OpenRouter API or local Ollama
- **Accessibility** — `aria-label`, `role="region"` / `role="main"` across all screens, labelled nav

## Getting Started

### Prerequisites

- [Rust](https://rustup.rs/) (stable)
- [Node.js](https://nodejs.org/) 20+
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
# Python sidecar tests (125 tests)
cd src-python
python -m pytest tests/ -v

# Frontend component + screen tests (110 tests)
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
│  • Discovery Mode (swipe cards)         │
│  • AI Playlist Generation               │
│  • Settings, Framer Motion transitions  │
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
│  • POST /discovery/start                │
│  • POST /discovery/feedback             │
│  • POST /discovery/end                  │
│  • POST /ai/generate                    │
│  • POST /ai/key · GET /ai/status        │
│  • SQLite read/write (shared DB)        │
└─────────────────────────────────────────┘
```

## License

MIT
