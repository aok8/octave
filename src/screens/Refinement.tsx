import React, { useState, useEffect, useReducer, useRef, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AnimatePresence, motion } from "framer-motion";
import { AudioFeatureSlider } from "../components/AudioFeatureSlider";
import { TrackCard } from "../components/TrackCard";
import { LoadingState } from "../components/LoadingState";
import { ErrorState } from "../components/ErrorState";
import { DonutChart } from "../charts/DonutChart";
import type { DonutDataPoint } from "../charts/DonutChart";
import type { Playlist } from "../types";
import type { Track, AudioFeatures } from "../types";

// ── Genre palette ─────────────────────────────────────────────────────────────

const GENRE_PALETTE: Record<string, string> = {
  "R&B": "#6A0DAD",
  "Neo-Soul": "#FF914D",
  "Hip-Hop": "#1DB9FF",
  "Chill Pop": "#FF6FAE",
  "Lo-Fi": "#4DB6AC",
  "Nu-Jazz": "#FFD93D",
  Other: "#555555",
};

// Normalize the Python sidecar's genre bucket names to GENRE_PALETTE keys.
// Python returns display names; the only mismatch is "RnB" → "R&B".
const PYTHON_BUCKET_NORMALIZE: Record<string, string> = {
  RnB: "R&B",
};

// ── Refinement state ──────────────────────────────────────────────────────────

interface SliderValues {
  energy: number;
  tempo: number;
  popularity: number;
  instrumentalness: number;
  acousticness: number;
  danceability: number;
  valence: number;
}

interface GenreConfig {
  exclude: string[]; // genre display labels
  boost: string[];   // genre display labels
}

interface RefinementState {
  sliders: SliderValues;
  defaults: SliderValues;
  genreConfig: GenreConfig;
  orderedTrackIds: string[];
  removedTrackIds: string[];
  isRefining: boolean;
}

type RefinementAction =
  | { type: "SET_DEFAULTS"; defaults: SliderValues }
  | { type: "SET_SLIDER"; feature: keyof SliderValues; value: number }
  | { type: "SET_REFINE_RESULT"; orderedTrackIds: string[]; removedTrackIds: string[] }
  | { type: "SET_REFINING"; value: boolean }
  | { type: "TOGGLE_EXCLUDE_GENRE"; genre: string }
  | { type: "TOGGLE_BOOST_GENRE"; genre: string };

function refinementReducer(state: RefinementState, action: RefinementAction): RefinementState {
  switch (action.type) {
    case "SET_DEFAULTS":
      return { ...state, defaults: action.defaults, sliders: action.defaults };
    case "SET_SLIDER":
      return { ...state, sliders: { ...state.sliders, [action.feature]: action.value } };
    case "SET_REFINE_RESULT":
      return {
        ...state,
        orderedTrackIds: action.orderedTrackIds,
        removedTrackIds: action.removedTrackIds,
        isRefining: false,
      };
    case "SET_REFINING":
      return { ...state, isRefining: action.value };
    case "TOGGLE_EXCLUDE_GENRE": {
      const { genre } = action;
      const alreadyExcluded = state.genreConfig.exclude.includes(genre);
      return {
        ...state,
        genreConfig: {
          ...state.genreConfig,
          exclude: alreadyExcluded
            ? state.genreConfig.exclude.filter((g) => g !== genre)
            : [...state.genreConfig.exclude, genre],
          // Remove from boost if we are excluding it
          boost: state.genreConfig.boost.filter((g) => g !== genre),
        },
      };
    }
    case "TOGGLE_BOOST_GENRE": {
      const { genre } = action;
      const alreadyBoosted = state.genreConfig.boost.includes(genre);
      return {
        ...state,
        genreConfig: {
          ...state.genreConfig,
          boost: alreadyBoosted
            ? state.genreConfig.boost.filter((g) => g !== genre)
            : [...state.genreConfig.boost, genre],
          // Remove from exclude if we are boosting it
          exclude: state.genreConfig.exclude.filter((g) => g !== genre),
        },
      };
    }
    default:
      return state;
  }
}

// ── Utility: compute median ───────────────────────────────────────────────────

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

// ── Build donut data from genre bucket map ────────────────────────────────────

function buildGenreData(
  trackIds: string[],
  trackMap: Record<string, Track>,
  excluded: string[],
  boosted: string[]
): DonutDataPoint[] {
  const counts: Record<string, number> = {};
  for (const [genre] of Object.entries(GENRE_PALETTE)) {
    counts[genre] = 0;
  }

  for (const tid of trackIds) {
    const rawBucket = trackMap[tid]?.genreBucket;
    if (rawBucket) {
      // Normalize Python display name → GENRE_PALETTE key (only "RnB" differs)
      const label = PYTHON_BUCKET_NORMALIZE[rawBucket] ?? rawBucket;
      if (counts[label] !== undefined) counts[label]++;
    }
  }

  return Object.entries(GENRE_PALETTE).map(([genre, color]) => {
    const isExcluded = excluded.includes(genre);
    const isBoosted = boosted.includes(genre);
    return {
      genre,
      count: counts[genre] ?? 0,
      color: isExcluded ? "#333333" : isBoosted ? color : color,
    };
  });
}

// ── Position delta badge ──────────────────────────────────────────────────────

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta === null) {
    return (
      <span
        data-testid="delta-badge-new"
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: "#4DB6AC",
          background: "rgba(77,182,172,0.15)",
          borderRadius: 4,
          padding: "1px 5px",
          flexShrink: 0,
        }}
      >
        NEW
      </span>
    );
  }
  if (delta === 0) {
    return (
      <span
        data-testid="delta-badge-unchanged"
        style={{
          fontSize: 10,
          color: "rgba(255,255,255,0.30)",
          flexShrink: 0,
        }}
      >
        —
      </span>
    );
  }
  const isUp = delta > 0;
  return (
    <span
      data-testid={isUp ? "delta-badge-up" : "delta-badge-down"}
      style={{
        fontSize: 10,
        fontWeight: 700,
        color: isUp ? "#28CA41" : "#FF5757",
        background: isUp ? "rgba(40,202,65,0.12)" : "rgba(255,87,87,0.12)",
        borderRadius: 4,
        padding: "1px 5px",
        flexShrink: 0,
      }}
    >
      {isUp ? `▲${delta}` : `▼${Math.abs(delta)}`}
    </span>
  );
}

// ── Export modal (inline) ─────────────────────────────────────────────────────

interface ExportModalProps {
  trackIds: string[];
  playlistId: string;
  onClose: () => void;
}

function ExportModal({ trackIds, playlistId, onClose }: ExportModalProps) {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [mode, setMode] = useState<"new" | "overwrite">("new");

  // Fetch user's playlists for the overwrite dropdown and for the default name
  useEffect(() => {
    invoke<Playlist[]>("fetch_playlists").then((data) => {
      const safe = Array.isArray(data) ? data : [];
      setPlaylists(safe);
      setSelectedPlaylistId(safe[0]?.id ?? "");
    }).catch(() => {
      // non-fatal — overwrite mode will just have no options
    });
  }, []);

  const sourcePlaylist = useMemo(
    () => playlists.find((p) => p.id === playlistId),
    [playlists, playlistId]
  );
  const defaultName = sourcePlaylist
    ? `${sourcePlaylist.name} — Refined`
    : "My Playlist — Refined";

  const [name, setName] = useState("");
  // Update name once we know the playlist name
  useEffect(() => {
    if (sourcePlaylist && !name) setName(defaultName);
  }, [defaultName, sourcePlaylist]); // eslint-disable-line react-hooks/exhaustive-deps
  // Set initial name synchronously on first render
  const nameRef = useRef(false);
  if (!nameRef.current) {
    nameRef.current = true;
  }
  const [description, setDescription] = useState("");

  async function handleExport() {
    const exportName = name || defaultName;
    if (!exportName.trim()) {
      setNameError("Playlist name cannot be empty.");
      return;
    }
    if (exportName.length > 100) {
      setNameError("Playlist name must be 100 characters or fewer.");
      return;
    }
    if (trackIds.length === 0) {
      setExportError("No tracks to export. Adjust filters to include tracks.");
      return;
    }
    setNameError(null);
    setExportError(null);
    setIsExporting(true);

    try {
      await invoke("export_playlist", {
        payload: {
          mode,
          playlist_id: mode === "overwrite" ? selectedPlaylistId : undefined,
          name: exportName.trim(),
          description: description.trim(),
          track_ids: trackIds,
        },
      });
      setSuccess(true);
      setTimeout(() => onClose(), 1500);
    } catch (err) {
      setExportError(
        err instanceof Error ? err.message : "Export failed. Please try again."
      );
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div
      data-testid="export-modal-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.72)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
    >
      <div
        data-testid="export-modal"
        style={{
          background: "#1a1a1a",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 16,
          padding: 32,
          width: 480,
          maxWidth: "90vw",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2
            style={{ fontSize: 18, fontWeight: 700, color: "#fff", margin: 0 }}
          >
            Export to Spotify
          </h2>
          <button
            onClick={onClose}
            aria-label="Close export modal"
            style={{
              background: "transparent",
              border: "none",
              color: "rgba(255,255,255,0.45)",
              cursor: "pointer",
              fontSize: 20,
              lineHeight: 1,
              padding: 4,
            }}
          >
            ×
          </button>
        </div>

        {success ? (
          <div
            data-testid="export-success"
            style={{
              textAlign: "center",
              padding: "24px 0",
              color: "#28CA41",
              fontSize: 15,
              fontWeight: 600,
            }}
          >
            Playlist exported to Spotify ✓
          </div>
        ) : (
          <>
            {/* Mode toggle */}
            <div style={{ display: "flex", gap: 8 }}>
              {(["new", "overwrite"] as const).map((m) => (
                <button
                  key={m}
                  data-testid={`export-mode-${m}`}
                  onClick={() => setMode(m)}
                  style={{
                    flex: 1,
                    padding: "8px 0",
                    borderRadius: 8,
                    border: `1px solid ${mode === m ? "#1DB9FF" : "rgba(255,255,255,0.12)"}`,
                    background: mode === m ? "rgba(29,185,255,0.10)" : "transparent",
                    color: mode === m ? "#1DB9FF" : "rgba(255,255,255,0.55)",
                    cursor: "pointer",
                    fontSize: 13,
                    fontFamily: "inherit",
                    fontWeight: mode === m ? 600 : 400,
                    transition: "all 150ms ease",
                  }}
                >
                  {m === "new" ? "Create new playlist" : "Overwrite existing"}
                </button>
              ))}
            </div>

            {/* Playlist name */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label
                htmlFor="export-playlist-name"
                style={{ fontSize: 12, color: "rgba(255,255,255,0.50)", fontWeight: 600 }}
              >
                Playlist name
              </label>
              <input
                id="export-playlist-name"
                data-testid="export-name-input"
                type="text"
                value={name || defaultName}
                maxLength={100}
                onChange={(e) => {
                  setName(e.target.value);
                  if (nameError) setNameError(null);
                }}
                placeholder={defaultName}
                style={{
                  background: "rgba(255,255,255,0.06)",
                  border: `1px solid ${nameError ? "#FF5757" : "rgba(255,255,255,0.12)"}`,
                  borderRadius: 8,
                  color: "#fff",
                  fontSize: 14,
                  padding: "10px 12px",
                  fontFamily: "inherit",
                  outline: "none",
                  boxSizing: "border-box",
                  width: "100%",
                }}
              />
              {nameError && (
                <span
                  data-testid="export-name-error"
                  style={{ fontSize: 12, color: "#FF5757" }}
                >
                  {nameError}
                </span>
              )}
            </div>

            {/* Description */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label
                htmlFor="export-description"
                style={{ fontSize: 12, color: "rgba(255,255,255,0.50)", fontWeight: 600 }}
              >
                Description{" "}
                <span style={{ color: "rgba(255,255,255,0.30)" }}>
                  ({description.length}/300)
                </span>
              </label>
              <textarea
                id="export-description"
                data-testid="export-description-input"
                value={description}
                maxLength={300}
                rows={3}
                onChange={(e) => setDescription(e.target.value)}
                style={{
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 8,
                  color: "#fff",
                  fontSize: 13,
                  padding: "10px 12px",
                  fontFamily: "inherit",
                  outline: "none",
                  resize: "vertical",
                  boxSizing: "border-box",
                  width: "100%",
                }}
              />
            </div>

            {/* Overwrite playlist selector */}
            {mode === "overwrite" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label
                  htmlFor="export-playlist-select"
                  style={{ fontSize: 12, color: "rgba(255,255,255,0.50)", fontWeight: 600 }}
                >
                  Select playlist to overwrite
                </label>
                <select
                  id="export-playlist-select"
                  data-testid="export-playlist-select"
                  value={selectedPlaylistId}
                  onChange={(e) => setSelectedPlaylistId(e.target.value)}
                  style={{
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 8,
                    color: "#fff",
                    fontSize: 13,
                    padding: "10px 12px",
                    fontFamily: "inherit",
                    outline: "none",
                    width: "100%",
                    cursor: "pointer",
                  }}
                >
                  {playlists.map((pl) => (
                    <option key={pl.id} value={pl.id} style={{ background: "#1a1a1a" }}>
                      {pl.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Error */}
            {exportError && (
              <ErrorState message={exportError} />
            )}

            {/* Track count */}
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", margin: 0 }}>
              {trackIds.length} track{trackIds.length !== 1 ? "s" : ""} will be exported
            </p>

            {/* Confirm */}
            <button
              data-testid="export-confirm-button"
              onClick={handleExport}
              disabled={isExporting}
              style={{
                width: "100%",
                padding: "12px 0",
                borderRadius: 10,
                border: "none",
                background: isExporting
                  ? "rgba(29,185,255,0.40)"
                  : "linear-gradient(135deg, #1DB9FF, #6A0DAD)",
                color: "#fff",
                fontSize: 14,
                fontWeight: 700,
                fontFamily: "inherit",
                cursor: isExporting ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                boxShadow: isExporting ? "none" : "0 0 16px rgba(29,185,255,0.35)",
                transition: "all 150ms ease",
              }}
            >
              {isExporting ? (
                <>
                  <SpinnerIcon /> Exporting…
                </>
              ) : (
                "Export to Spotify"
              )}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function SpinnerIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      style={{ animation: "octave-spin 0.8s linear infinite" }}
    >
      <circle cx="12" cy="12" r="9" opacity="0.25" />
      <path d="M12 3a9 9 0 0 1 9 9" />
    </svg>
  );
}

// ── Refinement screen ─────────────────────────────────────────────────────────

interface RefinementProps {
  playlistId?: string;
  onBack?: () => void;
  onExport?: (trackIds: string[]) => void;
}

const INITIAL_SLIDER_VALUES: SliderValues = {
  energy: 0.5,
  tempo: 100,
  popularity: 50,
  instrumentalness: 0.1,
  acousticness: 0.3,
  danceability: 0.65,
  valence: 0.5,
};

const INITIAL_STATE: RefinementState = {
  sliders: INITIAL_SLIDER_VALUES,
  defaults: INITIAL_SLIDER_VALUES,
  genreConfig: { exclude: [], boost: [] },
  orderedTrackIds: [],
  removedTrackIds: [],
  isRefining: false,
};

export function Refinement({ playlistId = "pl_01", onBack, onExport }: RefinementProps) {
  const [state, dispatch] = useReducer(refinementReducer, INITIAL_STATE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trackMap, setTrackMap] = useState<Record<string, Track>>({});
  const [originalTrackIds, setOriginalTrackIds] = useState<string[]>([]);
  const [audioFeatures, setAudioFeatures] = useState<AudioFeatures[]>([]);
  const [loadingFeatures, setLoadingFeatures] = useState(false);
  const [showExport, setShowExport] = useState(false);

  // Debounce ref
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load audio features on mount ──────────────────────────────────────────

  useEffect(() => {
    loadPlaylist();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playlistId]);

  async function loadPlaylist() {
    setLoading(true);
    setError(null);

    try {
      // Load real tracks from Spotify via Tauri IPC
      const tracks = await invoke<Track[]>("fetch_playlist_tracks", {
        playlistId,
      });

      const map: Record<string, Track> = {};
      for (const t of tracks) {
        if (t.id != null) map[t.id] = t;
      }
      setTrackMap(map);

      // Exclude local tracks (null id) — they have no audio features
      const ids = tracks.map((t) => t.id).filter((id): id is string => id != null);
      setOriginalTrackIds(ids);

      // Fetch audio features — fall back to empty on failure so the UI still loads
      let features: AudioFeatures[] = [];
      try {
        features = await invoke<AudioFeatures[]>("fetch_audio_features", {
          trackIds: ids,
        });
        setAudioFeatures(features);
      } catch {
        // Sidecar unavailable — sliders default to INITIAL_SLIDER_VALUES
      }

      // Compute median per feature to set slider defaults
      const pick = (key: keyof AudioFeatures) =>
        features.map((f) => f[key] as number).filter((v) => typeof v === "number");

      const defaults: SliderValues = {
        energy: median(pick("energy")),
        tempo: median(pick("tempo")),
        popularity: median(
          tracks
            .map((t) => t.popularity ?? 50)
            .filter((v) => typeof v === "number")
        ),
        instrumentalness: median(pick("instrumentalness")),
        acousticness: median(pick("acousticness")),
        danceability: median(pick("danceability")),
        valence: median(pick("valence")),
      };

      dispatch({ type: "SET_DEFAULTS", defaults });

      // Initial refine pass
      await runRefine(ids, defaults, { exclude: [], boost: [] });
    } catch (err) {
      setError("Could not load playlist data. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // ── Force-refresh audio features ─────────────────────────────────────────

  async function refreshAudioFeatures() {
    if (loadingFeatures || originalTrackIds.length === 0) return;
    setLoadingFeatures(true);
    try {
      const features = await invoke<AudioFeatures[]>("fetch_audio_features", {
        trackIds: originalTrackIds,
      });
      setAudioFeatures(features);
    } catch {
      // silently ignore — features stay as-is
    } finally {
      setLoadingFeatures(false);
    }
  }

  // ── Refine IPC call ───────────────────────────────────────────────────────

  async function runRefine(
    trackIds: string[],
    sliders: SliderValues,
    genreConfig: GenreConfig
  ) {
    dispatch({ type: "SET_REFINING", value: true });

    // Only include constraints for features that deviate from defaults
    const constraints: Record<string, { min: number; max: number }> = {};

    const addConstraint = (
      key: keyof SliderValues,
      rangeKey: string,
      min: number,
      max: number
    ) => {
      const val = sliders[key];
      const span = max - min;
      const bandMin = Math.max(min, val - span * 0.15);
      const bandMax = Math.min(max, val + span * 0.15);
      constraints[rangeKey] = { min: bandMin, max: bandMax };
    };

    addConstraint("energy", "energy", 0, 1);
    addConstraint("tempo", "tempo", 60, 200);
    addConstraint("instrumentalness", "instrumentalness", 0, 1);
    addConstraint("acousticness", "acousticness", 0, 1);
    addConstraint("danceability", "danceability", 0, 1);
    addConstraint("valence", "valence", 0, 1);
    addConstraint("popularity", "popularity", 0, 100);

    try {
      const raw = await invoke<Record<string, unknown>>("refine_playlist", {
        payload: {
          playlist_id: playlistId,
          track_ids: trackIds,
          constraints,
          genre_config: {
            exclude: genreConfig.exclude,
            boost: genreConfig.boost,
          },
        },
      });
      // Python returns snake_case; handle both for safety
      dispatch({
        type: "SET_REFINE_RESULT",
        orderedTrackIds: ((raw.orderedTrackIds ?? raw.ordered_track_ids ?? []) as string[]),
        removedTrackIds: ((raw.removedTrackIds ?? raw.removed_track_ids ?? []) as string[]),
      });
    } catch {
      // refine_playlist not available yet — use identity ordering
      dispatch({
        type: "SET_REFINE_RESULT",
        orderedTrackIds: trackIds.slice(0, 50),
        removedTrackIds: [],
      });
    }
  }

  // ── Trigger debounced refine when sliders/genre change ────────────────────

  const triggerRefine = useCallback(
    (sliders: SliderValues, genreConfig: GenreConfig) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        runRefine(originalTrackIds, sliders, genreConfig);
      }, 200);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [originalTrackIds]
  );

  function handleSliderChange(feature: keyof SliderValues, value: number) {
    dispatch({ type: "SET_SLIDER", feature, value });
    const next = { ...state.sliders, [feature]: value };
    triggerRefine(next, state.genreConfig);
  }

  // ── Genre interactions ────────────────────────────────────────────────────

  function handleGenreLeftClick(genre: string) {
    const next: GenreConfig = {
      exclude: state.genreConfig.exclude.includes(genre)
        ? state.genreConfig.exclude.filter((g) => g !== genre)
        : [...state.genreConfig.exclude, genre],
      boost: state.genreConfig.boost.filter((g) => g !== genre),
    };
    dispatch({ type: "TOGGLE_EXCLUDE_GENRE", genre });
    triggerRefine(state.sliders, next);
  }

  function handleGenreRightClick(e: React.MouseEvent, genre: string) {
    e.preventDefault();
    const next: GenreConfig = {
      boost: state.genreConfig.boost.includes(genre)
        ? state.genreConfig.boost.filter((g) => g !== genre)
        : [...state.genreConfig.boost, genre],
      exclude: state.genreConfig.exclude.filter((g) => g !== genre),
    };
    dispatch({ type: "TOGGLE_BOOST_GENRE", genre });
    triggerRefine(state.sliders, next);
  }

  // ── Derived display data ──────────────────────────────────────────────────

  // Compute medians from loaded audio features (undefined when no features)
  const featureMedians = useMemo(() => {
    if (audioFeatures.length === 0) return null;
    const pick = (key: keyof AudioFeatures) =>
      audioFeatures.map((f) => f[key] as number).filter((v) => typeof v === "number");
    return {
      energy: median(pick("energy")),
      tempo: median(pick("tempo")),
      instrumentalness: median(pick("instrumentalness")),
      acousticness: median(pick("acousticness")),
      danceability: median(pick("danceability")),
      valence: median(pick("valence")),
    };
  }, [audioFeatures]);

  const genreData = buildGenreData(
    originalTrackIds,
    trackMap,
    state.genreConfig.exclude,
    state.genreConfig.boost
  );

  // Map orderedTrackIds → position delta
  const originalPositionMap = Object.fromEntries(
    originalTrackIds.map((id, idx) => [id, idx])
  );

  const displayTracks = state.orderedTrackIds
    .filter((id) => !state.removedTrackIds.includes(id))
    .slice(0, 50)
    .map((id, newIdx) => {
      const origIdx = originalPositionMap[id];
      const delta =
        origIdx === undefined ? null : origIdx - newIdx; // positive = moved up
      return { id, delta };
    });

  // Inject spinner keyframes once
  useEffect(() => {
    if (typeof document === "undefined") return;
    const id = "octave-spin-style";
    if (document.getElementById(id)) return;
    const style = document.createElement("style");
    style.id = id;
    style.textContent = `@keyframes octave-spin { to { transform: rotate(360deg); } }`;
    document.head.appendChild(style);
  }, []);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "#121212",
        boxSizing: "border-box",
        position: "relative",
      }}
    >
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div
        style={{
          padding: "24px 32px 16px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexShrink: 0,
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        {onBack && (
          <button
            onClick={onBack}
            aria-label="Go back"
            style={{
              background: "transparent",
              border: "none",
              color: "rgba(255,255,255,0.55)",
              cursor: "pointer",
              padding: "4px 8px",
              fontSize: 18,
              fontFamily: "inherit",
              borderRadius: 6,
            }}
          >
            ←
          </button>
        )}
        <div style={{ flex: 1 }}>
          <h1
            style={{
              fontSize: 20,
              fontWeight: 700,
              color: "#ffffff",
              margin: 0,
              letterSpacing: "-0.3px",
            }}
          >
            Refine Playlist
          </h1>
          {playlistId && (
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.40)", margin: "3px 0 0" }}>
              {playlistId}
            </p>
          )}
        </div>
        <button
          data-testid="refresh-audio-features-btn"
          onClick={refreshAudioFeatures}
          disabled={loadingFeatures}
          style={{
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 6,
            padding: "4px 10px",
            fontSize: 12,
            color: "rgba(255,255,255,0.55)",
            cursor: loadingFeatures ? "default" : "pointer",
            fontFamily: "inherit",
          }}
        >
          {loadingFeatures ? "Refreshing…" : "↺ Refresh"}
        </button>
      </div>

      {/* ── Body ──────────────────────────────────────────────────────────── */}
      {loading ? (
        <div style={{ padding: 32 }}>
          <LoadingState type="chart" />
        </div>
      ) : error ? (
        <div style={{ padding: 32 }}>
          <ErrorState message={error} onRetry={loadPlaylist} />
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "280px 280px 1fr",
            gap: 0,
            flex: 1,
            overflow: "hidden",
          }}
        >
          {/* ── Left: sliders ─────────────────────────────────────────────── */}
          <div
            data-testid="sliders-panel"
            style={{
              padding: "24px 20px",
              borderRight: "1px solid rgba(255,255,255,0.06)",
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: 24,
            }}
          >
            <p
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "rgba(255,255,255,0.40)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                margin: 0,
              }}
            >
              Audio Features
            </p>

            <AudioFeatureSlider
              feature="energy"
              value={state.sliders.energy}
              onChange={(v) => handleSliderChange("energy", v)}
              median={featureMedians?.energy}
            />
            <AudioFeatureSlider
              feature="tempo"
              value={state.sliders.tempo}
              onChange={(v) => handleSliderChange("tempo", v)}
              median={featureMedians?.tempo}
            />
            <AudioFeatureSlider
              feature="energy"
              label="Popularity"
              value={state.sliders.popularity}
              min={0}
              max={100}
              onChange={(v) => handleSliderChange("popularity", v)}
            />
            <AudioFeatureSlider
              feature="instrumentalness"
              value={state.sliders.instrumentalness}
              onChange={(v) => handleSliderChange("instrumentalness", v)}
              median={featureMedians?.instrumentalness}
            />
            <AudioFeatureSlider
              feature="acousticness"
              value={state.sliders.acousticness}
              onChange={(v) => handleSliderChange("acousticness", v)}
              median={featureMedians?.acousticness}
            />
            <AudioFeatureSlider
              feature="danceability"
              value={state.sliders.danceability}
              onChange={(v) => handleSliderChange("danceability", v)}
              median={featureMedians?.danceability}
            />
            <AudioFeatureSlider
              feature="valence"
              value={state.sliders.valence}
              onChange={(v) => handleSliderChange("valence", v)}
              median={featureMedians?.valence}
            />
          </div>

          {/* ── Center: mini donut ────────────────────────────────────────── */}
          <div
            data-testid="donut-panel"
            style={{
              padding: "24px 20px",
              borderRight: "1px solid rgba(255,255,255,0.06)",
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: 16,
            }}
          >
            <p
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "rgba(255,255,255,0.40)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                margin: 0,
              }}
            >
              Genre Mix
            </p>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.30)", margin: 0 }}>
              Left-click to exclude · Right-click to boost
            </p>

            {/* Wrap in a div that captures right-click per segment */}
            <div
              data-testid="genre-donut-wrapper"
              onContextMenu={(e) => {
                // Identify which segment was right-clicked via data-genre
                const target = e.target as SVGPathElement;
                const genre = target.getAttribute?.("data-genre");
                if (genre) handleGenreRightClick(e, genre);
                else e.preventDefault();
              }}
            >
              <DonutChart
                data={genreData}
                width={250}
                height={250}
                onSegmentClick={handleGenreLeftClick}
              />
            </div>

            {/* Genre legend with state indicators */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {genreData
                .filter((d) => d.count > 0)
                .map((d) => {
                  const isExcluded = state.genreConfig.exclude.includes(d.genre);
                  const isBoosted = state.genreConfig.boost.includes(d.genre);
                  return (
                    <div
                      key={d.genre}
                      data-testid={`genre-legend-${d.genre}`}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        opacity: isExcluded ? 0.35 : 1,
                      }}
                    >
                      <div
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: GENRE_PALETTE[d.genre],
                          boxShadow: isBoosted
                            ? `0 0 6px 2px ${GENRE_PALETTE[d.genre]}`
                            : "none",
                          flexShrink: 0,
                        }}
                      />
                      <span
                        style={{
                          fontSize: 12,
                          color: isExcluded
                            ? "rgba(255,255,255,0.25)"
                            : isBoosted
                            ? "#fff"
                            : "rgba(255,255,255,0.55)",
                          flex: 1,
                        }}
                      >
                        {d.genre}
                      </span>
                      {isExcluded && (
                        <span
                          style={{
                            fontSize: 10,
                            color: "rgba(255,255,255,0.30)",
                            border: "1px solid rgba(255,255,255,0.12)",
                            borderRadius: 4,
                            padding: "1px 5px",
                          }}
                        >
                          off
                        </span>
                      )}
                      {isBoosted && (
                        <span
                          style={{
                            fontSize: 10,
                            color: "#FFD93D",
                            border: "1px solid rgba(255,211,61,0.25)",
                            borderRadius: 4,
                            padding: "1px 5px",
                          }}
                        >
                          boost
                        </span>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>

          {/* ── Right: track preview ──────────────────────────────────────── */}
          <div
            data-testid="track-preview-panel"
            style={{
              padding: "24px 20px",
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 4,
              }}
            >
              <p
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "rgba(255,255,255,0.40)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  margin: 0,
                }}
              >
                Preview ({displayTracks.length} tracks)
              </p>
              {state.isRefining && (
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.30)" }}>
                  Updating…
                </span>
              )}
            </div>

            <AnimatePresence>
              {displayTracks.map(({ id, delta }) => {
                const track = trackMap[id];
                if (!track) return null;
                const features = audioFeatures.find((f) => f.trackId === id);
                return (
                  <motion.div
                    key={id}
                    layout
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.97 }}
                    transition={{ duration: 0.18, ease: "easeOut" }}
                    style={{ display: "flex", alignItems: "center", gap: 8 }}
                  >
                    <DeltaBadge delta={delta} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <TrackCard track={track} features={features} />
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {displayTracks.length === 0 && !state.isRefining && (
              <p style={{ fontSize: 14, color: "rgba(255,255,255,0.30)", margin: 0 }}>
                No tracks match the current filters.
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Export CTA bar ─────────────────────────────────────────────────── */}
      {!loading && !error && (
        <div
          data-testid="export-cta-bar"
          style={{
            position: "sticky",
            bottom: 0,
            left: 0,
            right: 0,
            background: "rgba(18,18,18,0.92)",
            backdropFilter: "blur(12px)",
            borderTop: "1px solid rgba(29,185,255,0.20)",
            boxShadow: "0 -4px 24px rgba(29,185,255,0.08)",
            padding: "14px 32px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            flexShrink: 0,
            zIndex: 10,
          }}
        >
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.40)", margin: 0 }}>
            {displayTracks.length} tracks ready
          </p>
          <button
            data-testid="export-to-spotify-button"
            onClick={() => {
              const ids = displayTracks.map((t) => t.id);
              if (onExport) onExport(ids);
              else setShowExport(true);
            }}
            style={{
              padding: "10px 28px",
              borderRadius: 10,
              border: "none",
              background: "linear-gradient(135deg, #1DB9FF, #6A0DAD)",
              color: "#fff",
              fontSize: 14,
              fontWeight: 700,
              fontFamily: "inherit",
              cursor: "pointer",
              boxShadow: "0 0 20px rgba(29,185,255,0.40)",
              transition: "box-shadow 150ms ease, transform 150ms ease",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.boxShadow =
                "0 0 32px rgba(29,185,255,0.65)";
              (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.02)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.boxShadow =
                "0 0 20px rgba(29,185,255,0.40)";
              (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
            }}
          >
            Export to Spotify
          </button>
        </div>
      )}

      {/* ── Export modal ───────────────────────────────────────────────────── */}
      {showExport && (
        <ExportModal
          trackIds={displayTracks.map((t) => t.id)}
          playlistId={playlistId}
          onClose={() => setShowExport(false)}
        />
      )}
    </div>
  );
}

export default Refinement;
