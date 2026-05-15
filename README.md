# Octave

**Find your flow.**

Octave is a desktop app that gives you fine-tuned control over your Spotify playlists. Pull in any playlist, dial in the exact energy and mood you want using audio feature sliders, filter or boost genres, and export a refined playlist back to Spotify — all in a few clicks.

![Octave screenshot](docs/screenshot.png)

---

## What Octave does

| Feature | What it means |
|---|---|
| **Playlist Refinement** | Adjust 7 sliders (energy, tempo, valence, danceability, acousticness, instrumentalness, popularity) to filter and re-rank any of your Spotify playlists |
| **Genre Control** | An interactive genre donut shows your playlist's genre mix. Left-click a genre to exclude it; right-click to boost it |
| **Seed Song Discovery** | Search any track, get recommendations in its orbit, then launch a swipe-card discovery session to keep or skip tracks one at a time |
| **Discovery Mode** | Swipe through recommended tracks (← skip / → keep), build a queue, and export what you love to a new Spotify playlist |
| **AI Playlist Generation** | Describe the vibe you want in plain language ("late night study session, no lyrics") and Octave generates a playlist using OpenRouter or a local Ollama model |
| **Insights** | Visual breakdowns of your playlist — genre donut, mood/energy flow over time, tempo map, and key distribution |
| **Export to Spotify** | Save any refined or generated playlist as a new Spotify playlist, or overwrite an existing one |

---

## Requirements

- Windows 10 or 11 (WebView2 is pre-installed on Windows 11; Windows 10 may prompt to install it)
- A Spotify account (free or premium)

---

## Installation

1. Go to [**Releases**](https://github.com/aok8/octave/releases/latest)
2. Download **`Octave_x.x.x_x64-setup.exe`**
3. Run the installer — Octave installs per-machine and creates a Start Menu shortcut
4. Launch **Octave** from the Start Menu

Octave checks for updates automatically on launch and will prompt you when a new version is available.

---

## Getting started

### 1. Connect your Spotify account

On first launch, click **Connect Spotify**. Octave opens a browser window for Spotify's OAuth login. Sign in, grant access, and you'll be returned to the app automatically.

Your access token is stored securely in the Windows credential store — Octave never sees your Spotify password.

### 2. Refine a playlist

- Click **Seed Playlist** on the Home screen
- Browse or search your Spotify library and select a playlist
- Click **Refine** to open the Refinement screen
- Use the **sliders** on the left to dial in the audio profile you want
- Use the **genre donut** in the centre to exclude or boost genres (left-click = exclude, right-click = boost)
- Watch the track list on the right update live
- Hit **Export to Spotify** when you're happy

### 3. Discover from a seed track

- Click **Seed Song** on the Home screen
- Search for any track and select it
- Scroll down to see recommendations, then click **Discover from this track**
- In Discovery Mode, press → or click the right button to keep a track, ← or the left button to skip
- When you've gone through the session, export your kept tracks to Spotify

### 4. Generate a playlist with AI

- Click **AI Playlist** on the Home screen (or navigate via the sidebar)
- On first use, enter an OpenRouter API key — or click **Use Local Model** if you have Ollama running locally
- Type a description of what you want (up to 500 characters)
- Click **Generate** — Octave searches Spotify for each suggestion and builds a playable playlist
- Export to Spotify when done

### 5. View Insights

- From any playlist view, click **View Insights**
- See the genre breakdown, mood/energy flow, tempo map, and key distribution for that playlist
- Click **Refine Playlist →** to jump straight into refinement

---

## Keyboard shortcuts

| Key | Action |
|---|---|
| `→` | Keep track (Discovery Mode) |
| `←` | Skip track (Discovery Mode) |

---

## AI setup (optional)

Octave supports two AI backends for playlist generation:

**OpenRouter** (cloud, recommended)
1. Sign up at [openrouter.ai](https://openrouter.ai) and create a free API key
2. In Octave → AI Playlist, paste your key and click **Save Key**

**Ollama** (local, no account needed)
1. Install [Ollama](https://ollama.ai) and pull a model (`ollama pull llama3`)
2. Make sure Ollama is running (`ollama serve`)
3. Click **Use Local Model** in Octave — no key required

---

## Privacy

- Octave communicates only with Spotify's API (for music data) and your chosen AI provider (if you use playlist generation)
- Your Spotify token is stored in the Windows credential store, never on disk in plain text
- No usage data is collected or transmitted

---

## License

MIT — see [LICENSE](LICENSE)
