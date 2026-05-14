import React, { useState } from "react";
import { AppShell } from "./layouts/AppShell";
import { TrackCard } from "./components/TrackCard";
import { PlaylistCard } from "./components/PlaylistCard";
import { GenreChip } from "./components/GenreChip";
import { AudioFeatureSlider } from "./components/AudioFeatureSlider";
import { LoadingState } from "./components/LoadingState";
import { ErrorState } from "./components/ErrorState";
import { Settings } from "./screens/Settings";
import { AIPrompt } from "./screens/AIPrompt";
import {
  mockTracks,
  mockPlaylists,
  mockAudioFeatures,
  mockGenres,
} from "./mocks";
import type { AudioFeatures, GenreBucket } from "./types";

// ── Feature map for quick lookup ──────────────────────────────────────────────
const featureMap = Object.fromEntries(
  mockAudioFeatures.map((f) => [f.trackId, f])
) as Record<string, AudioFeatures>;

// ── Genre chip variant demo ───────────────────────────────────────────────────
const DEMO_GENRES: GenreBucket[] = ["rnb", "neosoul", "hiphop", "chillpop", "lofi", "nujazz"];

// ── Demo pages ────────────────────────────────────────────────────────────────

function TracksPage() {
  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: "#fff", marginBottom: 16, marginTop: 0 }}>
        Tracks
      </h2>
      <div>
        {mockTracks.slice(0, 8).map((track) => (
          <TrackCard
            key={track.id}
            track={track}
            features={featureMap[track.id]}
            genres={mockGenres[track.id]}
            onClick={() => {}}
          />
        ))}
      </div>
    </div>
  );
}

function PlaylistsPage() {
  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: "#fff", marginBottom: 16, marginTop: 0 }}>
        Playlists
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {mockPlaylists.map((pl) => (
          <PlaylistCard key={pl.id} playlist={pl} onClick={() => {}} />
        ))}
      </div>
    </div>
  );
}

function SlidersPage() {
  const [energy, setEnergy] = useState(0.65);
  const [tempo, setTempo] = useState(100);
  const [valence, setValence] = useState(0.50);
  const [danceability, setDanceability] = useState(0.70);
  const [acousticness, setAcousticness] = useState(0.30);
  const [instrumentalness, setInstrumentalness] = useState(0.10);
  const [speechiness, setSpeechiness] = useState(0.08);

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: "#fff", marginBottom: 16, marginTop: 0 }}>
        Audio Feature Sliders
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 480 }}>
        <AudioFeatureSlider feature="energy" value={energy} onChange={setEnergy} />
        <AudioFeatureSlider feature="tempo" value={tempo} onChange={setTempo} />
        <AudioFeatureSlider feature="valence" value={valence} onChange={setValence} />
        <AudioFeatureSlider feature="danceability" value={danceability} onChange={setDanceability} />
        <AudioFeatureSlider feature="acousticness" value={acousticness} onChange={setAcousticness} />
        <AudioFeatureSlider feature="instrumentalness" value={instrumentalness} onChange={setInstrumentalness} />
        <AudioFeatureSlider feature="speechiness" value={speechiness} onChange={setSpeechiness} />
      </div>

      <h2 style={{ fontSize: 18, fontWeight: 700, color: "#fff", margin: "32px 0 16px" }}>
        Genre Chips
      </h2>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {DEMO_GENRES.map((g) => <GenreChip key={g + "_default"} genre={g} />)}
        {DEMO_GENRES.map((g) => <GenreChip key={g + "_boosted"} genre={g} variant="boosted" />)}
        {DEMO_GENRES.map((g) => <GenreChip key={g + "_excluded"} genre={g} variant="excluded" />)}
      </div>
    </div>
  );
}

function StatesPage() {
  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: "#fff", marginBottom: 16, marginTop: 0 }}>
        Loading States
      </h2>
      <h3 style={{ fontSize: 14, color: "rgba(255,255,255,0.6)", marginBottom: 8 }}>List</h3>
      <LoadingState type="list" rows={4} />
      <h3 style={{ fontSize: 14, color: "rgba(255,255,255,0.6)", margin: "24px 0 8px" }}>Card</h3>
      <LoadingState type="card" rows={4} />
      <h3 style={{ fontSize: 14, color: "rgba(255,255,255,0.6)", margin: "24px 0 8px" }}>Chart</h3>
      <LoadingState type="chart" />

      <h2 style={{ fontSize: 18, fontWeight: 700, color: "#fff", margin: "32px 0 16px" }}>
        Error State
      </h2>
      <ErrorState
        message="Could not load playlist data. Check your connection and try again."
        onRetry={() => alert("Retry clicked")}
      />
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────

type PageId = "home" | "library" | "create" | "ai-prompt" | "settings";

const PAGE_MAP: Record<PageId, React.ReactNode> = {
  home: <TracksPage />,
  library: <PlaylistsPage />,
  create: <SlidersPage />,
  "ai-prompt": <AIPrompt />,
  settings: <Settings />,
};

function App() {
  const [activePage, setActivePage] = useState<PageId>("home");

  return (
    <AppShell
      activeNav={activePage}
      onNavChange={(id) => setActivePage(id as PageId)}
    >
      {PAGE_MAP[activePage]}
    </AppShell>
  );
}

export default App;
