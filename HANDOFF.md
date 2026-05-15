# Octave — Developer Handoff

> Last updated: 2026-05-15 (after Sprint 17)

This document is the canonical handoff reference for any engineer picking up Octave.
It covers current state, architecture decisions, what is and isn't wired, and the remaining pre-production checklist.

---

## Current state

The app is **feature-complete and tested** through Sprint 17. All screens render, all navigation flows are wired, and all Tauri IPC commands use the OS keychain for the Spotify token (no token ever passes through the frontend).

141 Vitest tests across 18 test files — all passing.

The Python sidecar binary has **not yet been built** (placeholder 0-byte file in repo). Full end-to-end testing requires running the sidecar manually (see below).

---

## What's fully wired (real IPC)

| Feature | Frontend | Rust command | Python sidecar route |
|---|---|---|---|
| Spotify OAuth login | `Login.tsx` | `start_oauth`, `get_auth_state` | — |
| Browse playlists | `SeedPlaylist.tsx` | `fetch_playlists` | `GET /playlists` |
| View playlist tracks | `Insights.tsx` | `fetch_playlist_tracks` | `GET /playlists/{id}/tracks` |
| Audio feature insights | `Insights.tsx` | `fetch_audio_features` | `GET /tracks/audio-features` |
| Tempo / Key charts | `Insights.tsx` | `fetch_insights` | `GET /insights/{id}` |
| Track search | `SeedSong.tsx` | `search_tracks` | `GET /search/tracks` |
| Recommendations | `SeedSong.tsx` | `fetch_recommendations` | `GET /search/recommendations` |
| Refinement sliders | `Refinement.tsx` | `fetch_playlist_tracks`, `fetch_audio_features`, `refine_playlist` | `GET /playlists/{id}/tracks`, `POST /refine` |
| Export to Spotify | `Export.tsx` / `ExportModal` | `export_playlist` | `POST /export/new`, `POST /export/overwrite/{id}` |
| Discovery Mode | `DiscoveryMode.tsx` | `start_discovery_session`, `send_discovery_feedback`, `end_discovery_session`, `start_discovery_export` | `POST /discovery/*`, `POST /export/new` |
| AI playlist generation | `AIPrompt.tsx` | `set_ai_key`, `get_ai_status`, `generate_ai_playlist` | `POST /ai/generate`, `GET /ai/status` |
| Settings / logout | `Settings.tsx` | `get_user_profile`, `logout`, `export_db`, `import_db` | `GET /auth/profile`, `POST /auth/logout`, `POST /storage/*` |

---

## What is still using mock data

| Location | What's mocked | Why / next step |
|---|---|---|
| `src/mocks/index.ts` → `mockGenres` | Genre-bucket mapping per track ID (used in Refinement's donut chart) | No genre endpoint exists yet. Wire to a real genre classification call or derive from Spotify artist genres. |
| `src/screens/Refinement.tsx` line ~149 | `buildGenreData()` reads from `mockGenres[trackId]` | Replace once genre API is available. Until then donut shows 0 counts for all real tracks. |

---

## Architecture decisions (context for new engineers)

### Token plumbing
Spotify access tokens are **never passed from the frontend**. All Rust IPC commands call `crate::auth::get_stored_token()` internally, which reads from the OS keychain (Windows Credential Store / macOS Keychain). In CI/tests, set `OCTAVE_TEST_TOKEN=<token>` as an env var — the function checks this first.

### Tauri invoke conventions
```ts
// Commands with a blob payload forwarded to Python (refine_playlist, export_playlist):
invoke("refine_playlist", { payload: { playlist_id, track_ids, constraints, genre_config } })

// Commands with named scalar params (everything else):
invoke("fetch_playlist_tracks", { playlistId })   // camelCase auto-maps to snake_case
invoke("search_tracks", { query: "..." })          // key must match Rust param name exactly
```
Tauri converts camelCase → snake_case automatically (e.g., `playlistId` → `playlist_id`), but it **cannot bridge unrelated words** — if the Rust param is `query: String`, the JS key must be `query`, not `q`.

### Navigation
App-level routing is a discriminated union in `App.tsx`:
```ts
type Screen =
  | { id: "loading" } | { id: "login" } | { id: "home" }
  | { id: "seed-playlist" } | { id: "seed-song" }
  | { id: "insights"; playlistId: string }
  | { id: "refinement"; playlistId: string }
  | { id: "export"; trackIds: string[]; playlistId: string }
  | { id: "ai-prompt" } | { id: "discover"; seedTrackId?: string } | { id: "settings" }
```
No router library — just `useState<Screen>`. Adding a new screen means adding a union member, a `navIdForScreen` case, and a `renderScreen` case.

### Python sidecar lifecycle
The sidecar runs as a sideband process at `http://127.0.0.1:8000`. The port is configurable via `OCTAVE_SIDECAR_PORT` env var. Rust commands proxy requests to it using `reqwest`. The sidecar binary is expected at `src-tauri/binaries/main-x86_64-pc-windows-msvc.exe` (platform triple is auto-selected by Tauri).

---

## Pre-production checklist

These are the remaining items before the app can be handed to QA for production testing:

### Required
- [ ] **Build Python sidecar binary** — `cd src-python && pyinstaller --onefile --name main main.py`, then copy binary to `src-tauri/binaries/main-<target-triple>.exe`. Without this, all sidecar-backed features are unavailable in the packaged app.
- [ ] **Add `octave://callback` to Spotify Developer Dashboard** — go to [developer.spotify.com](https://developer.spotify.com/dashboard), open your app, add `octave://callback` as a Redirect URI. Without this, OAuth login will return an error.

### Recommended before ship
- [ ] **Wire real genre data** — replace `mockGenres` in `src/mocks/index.ts` with a real genre classification (e.g., derive from Spotify artist genres on the Python side, surface via a new `/genres/{playlist_id}` route).
- [ ] **Decide binary commit strategy** — PyInstaller output is ~60 MB. Options: (a) commit to repo via Git LFS, (b) build in CI and upload as a release artifact, (c) keep as a local dev prerequisite. The current placeholder (0-byte file) is committed to avoid Tauri packaging errors.
- [ ] **End-to-end smoke test** with real credentials — run `npm run tauri dev` with the sidecar running, log in with a real Spotify account, walk through Seed → Insights → Refinement → Export.

---

## Running locally (full stack)

```bash
# 1. Frontend deps
npm install

# 2. Python sidecar deps
pip install -r src-python/requirements.txt

# 3. Start sidecar (keep running in a separate terminal)
cd src-python && python main.py

# 4. Create .env with your Spotify client ID
echo "VITE_SPOTIFY_CLIENT_ID=your_id_here" > .env

# 5. Launch Tauri dev
npm run tauri dev
```

### Tests only (no sidecar needed)

```bash
# Frontend (141 tests)
npx vitest run

# Python sidecar (127 tests)
cd src-python && python -m pytest tests/ -v

# Rust lib tests (10 tests — requires OCTAVE_TEST_TOKEN set or wiremock)
cd src-tauri && cargo test --lib
```

---

## Repo layout

```
octave/
├── src/                    # React frontend (TypeScript)
│   ├── screens/            # One file per screen
│   ├── screens/__tests__/  # Vitest tests (one per screen)
│   ├── components/         # Shared UI components
│   ├── charts/             # D3 chart components
│   ├── layouts/            # AppShell (sidebar nav)
│   ├── mocks/              # Mock data (mockGenres still in use)
│   └── types/index.ts      # Shared TypeScript interfaces
├── src-tauri/              # Rust (Tauri shell)
│   ├── src/
│   │   ├── auth.rs         # PKCE OAuth + keychain helpers
│   │   ├── commands/       # Tauri IPC commands (api.rs, discovery.rs)
│   │   └── lib.rs          # Command registration
│   └── binaries/           # Python sidecar binary (placeholder)
├── src-python/             # FastAPI sidecar
│   ├── main.py             # App entrypoint
│   ├── routers/            # Route modules per domain
│   └── tests/              # pytest suite
├── .env.example            # Required env vars
└── HANDOFF.md              # This file
```

---

## Open PRs / branches

| Branch | PR | Status |
|---|---|---|
| `sprint/17-real-data` | [#14 fix: wire real data](https://github.com/aok8/octave/pull/14) | Open — ready to merge |
