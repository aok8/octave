# Octave

> **Development paused**
>
> Spotify [deprecated the `/audio-features` API endpoint](https://developer.spotify.com/blog/2024-11-27-changes-to-the-web-api) in November 2024, removing the per-track audio analysis data (energy, valence, danceability, tempo, key, etc.) that powers Octave's playlist refinement recommendations. Until a reliable replacement source is integrated, active feature development is on hold.
>
> The **Playlist Insights** charts and audio analysis still work via the [SoundNet / Track Analysis RapidAPI](https://rapidapi.com/search/track-analysis), but catalog coverage is limited. The **Refine Playlist** feature is disabled until recommendations can be rebuilt on a new data foundation.

---

A Tauri + React desktop app for Spotify playlist analysis and curation.

## What works today

| Feature | Status |
|---|---|
| Spotify OAuth login | ✅ |
| Playlist library browser | ✅ |
| Playlist Insights — genre breakdown, audio flow, tempo map, key distribution | ✅ |
| Audio analysis via RapidAPI SoundNet (requires free API key) | ✅ partial coverage |
| Song-based discovery (similarity recommendations) | disabled |
| AI playlist prompt | disabled |
| Export playlist to Spotify | ✅ |
| Refine Playlist (filter/boost by audio features) | disabled |

## Tech stack

- **Frontend**: React 18, TypeScript, D3.js, Tauri IPC
- **Backend sidecar**: Python 3.13, FastAPI, SQLite, Spotipy
- **Desktop shell**: Tauri v2 (Rust)

## Running locally

```bash
# Install JS deps
npm install

# Install Python deps
cd src-python && pip install -r requirements.txt && cd ..

# Build Python sidecar
cd src-python && python -m PyInstaller main.spec --noconfirm && cd ..
cp src-python/dist/main.exe src-python/main-x86_64-pc-windows-msvc.exe

# Run in dev mode
npm run tauri dev
```

### Optional: RapidAPI key for audio analysis

1. Create a free account at [rapidapi.com](https://rapidapi.com)
2. Subscribe to the **Track Analysis** API (free tier)
3. Open **Settings** inside the app and paste your key

Without a key, audio features fall back to estimated (synthetic) values.

## Why development is paused

Octave's core value proposition — smart playlist refinement — depends on per-track audio features. Spotify's official API provided these for free until November 2024, when they were removed without a public replacement. The two current workarounds both have significant gaps:

- **SoundNet (RapidAPI)**: independent catalog, limited coverage on niche tracks, 5 req/s rate limit, no fallback 404 on cache miss.
- **Synthetic fallback**: fixed mid-range values (energy=0.5, valence=0.5, etc.) — usable for chart rendering, not for meaningful filtering or recommendations.

Potential paths forward being evaluated:
- AcousticBrainz (open, but shut down in 2022 — data snapshot still available)
- Essentia.js (in-browser audio analysis — requires the actual audio file)
- Building a lightweight model trained on the Spotify feature dump before deprecation
