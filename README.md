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
| Sprint 1 | Tauri scaffold, auth, SQLite schema, sidecar health | ✅ Done |
| Sprint 2 | Playlist fetch/cache, audio features, search/recs, UI components | ✅ Done |
| Sprint 3 | Home screen, Seed flows, D3 Insights charts | 🔜 Next |
| Sprint 4 | AI playlist generation (F-14 guardrail system) | ⏳ Planned |
| Sprint 5 | Polish, packaging, export | ⏳ Planned |

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

# Run Tauri dev mode (launches frontend + Rust shell)
npm run tauri dev
```

### Python sidecar (standalone)

```bash
cd src-python
python main.py        # starts FastAPI on port 8000
```

### Tests

```bash
# Python sidecar tests
cd src-python
python -m pytest tests/ -v

# Frontend component tests
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
└────────────┬────────────────────────────┘
             │ IPC (Tauri commands)
┌────────────▼────────────────────────────┐
│  React Frontend (TypeScript/Vite)       │
│  • Dark glassmorphism UI                │
│  • D3.js audio feature charts           │
│  • Framer Motion transitions            │
└────────────┬────────────────────────────┘
             │ HTTP (localhost:8000)
┌────────────▼────────────────────────────┐
│  Python Sidecar (FastAPI)               │
│  • /playlists   stale-while-revalidate  │
│  • /tracks/audio-features  batch+cache  │
│  • /search/tracks   /search/recommendations │
│  • SQLite read/write (shared DB)        │
└─────────────────────────────────────────┘
```

## License

MIT
