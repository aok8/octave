import type {
  UserProfile,
  Playlist,
  Track,
  AudioFeatures,
  GenreBucket,
} from "../types";

// ── User ──────────────────────────────────────────────────────────────────────

export const mockUser: UserProfile = {
  id: "user_alain_k",
  displayName: "Alain K.",
  email: "alain@example.com",
  avatarUrl: undefined,
};

// ── Playlists ─────────────────────────────────────────────────────────────────

export const mockPlaylists: Playlist[] = [
  {
    id: "pl_01",
    name: "Midnight R&B Feels",
    description: "Late-night soul and smooth R&B",
    trackCount: 34,
    isPublic: false,
    cachedAt: Date.now() - 1 * 86_400_000,
  },
  {
    id: "pl_02",
    name: "Lo-Fi Study Block",
    description: "Focus-friendly lo-fi beats",
    trackCount: 52,
    isPublic: false,
    cachedAt: Date.now() - 3 * 86_400_000,
  },
  {
    id: "pl_03",
    name: "Hip-Hop Energy",
    description: "High-BPM rap for workouts",
    trackCount: 28,
    isPublic: true,
    cachedAt: Date.now() - 7 * 86_400_000,
  },
  {
    id: "pl_04",
    name: "Neo Soul Sunday",
    description: "Warm tones for a slow morning",
    trackCount: 41,
    isPublic: false,
    cachedAt: Date.now() - 14 * 86_400_000,
  },
  {
    id: "pl_05",
    name: "Chill Pop Commute",
    description: "Easy listening for the ride",
    trackCount: 60,
    isPublic: true,
    cachedAt: Date.now() - 2 * 86_400_000,
  },
  {
    id: "pl_06",
    name: "Nu-Jazz Late Session",
    description: "Modern jazz with electronic edges",
    trackCount: 23,
    isPublic: false,
    cachedAt: Date.now() - 10 * 86_400_000,
  },
];

// ── Tracks ────────────────────────────────────────────────────────────────────

export const mockTracks: Track[] = [
  {
    id: "tr_01",
    name: "Slow Burn",
    artistNames: ["SiR"],
    albumName: "Chasing Summer",
    durationMs: 213_000,
    popularity: 72,
  },
  {
    id: "tr_02",
    name: "How Many",
    artistNames: ["D'Angelo"],
    albumName: "Voodoo",
    durationMs: 198_000,
    popularity: 68,
  },
  {
    id: "tr_03",
    name: "PRIDE.",
    artistNames: ["Kendrick Lamar"],
    albumName: "DAMN.",
    durationMs: 272_000,
    popularity: 88,
  },
  {
    id: "tr_04",
    name: "Redbone",
    artistNames: ["Childish Gambino"],
    albumName: "Awaken, My Love!",
    durationMs: 326_000,
    popularity: 91,
  },
  {
    id: "tr_05",
    name: "Coffee",
    artistNames: ["beabadoobee"],
    albumName: "Fake It Flowers",
    durationMs: 154_000,
    popularity: 80,
  },
  {
    id: "tr_06",
    name: "Feelin Good",
    artistNames: ["Lofi Lut"],
    albumName: "Rainy Afternoons",
    durationMs: 178_000,
    popularity: 54,
  },
  {
    id: "tr_07",
    name: "All Falls Down",
    artistNames: ["Kanye West"],
    albumName: "The College Dropout",
    durationMs: 237_000,
    popularity: 85,
  },
  {
    id: "tr_08",
    name: "The Worst",
    artistNames: ["Jhené Aiko"],
    albumName: "Sail Out",
    durationMs: 185_000,
    popularity: 74,
  },
  {
    id: "tr_09",
    name: "Thinkin Bout You",
    artistNames: ["Frank Ocean"],
    albumName: "channel ORANGE",
    durationMs: 200_000,
    popularity: 90,
  },
  {
    id: "tr_10",
    name: "On & On",
    artistNames: ["Erykah Badu"],
    albumName: "Baduizm",
    durationMs: 258_000,
    popularity: 77,
  },
  {
    id: "tr_11",
    name: "Blue World",
    artistNames: ["Mac Miller"],
    albumName: "Swimming",
    durationMs: 224_000,
    popularity: 82,
  },
  {
    id: "tr_12",
    name: "Autumn Leaves",
    artistNames: ["Nujabes"],
    albumName: "Modal Soul",
    durationMs: 295_000,
    popularity: 69,
  },
];

// ── Audio Features ────────────────────────────────────────────────────────────

export const mockAudioFeatures: AudioFeatures[] = [
  { trackId: "tr_01", energy: 0.48, tempo: 82, valence: 0.42, danceability: 0.66, acousticness: 0.35, instrumentalness: 0.01, speechiness: 0.05, loudness: -8.2 },
  { trackId: "tr_02", energy: 0.55, tempo: 88, valence: 0.38, danceability: 0.72, acousticness: 0.42, instrumentalness: 0.04, speechiness: 0.06, loudness: -9.1 },
  { trackId: "tr_03", energy: 0.62, tempo: 93, valence: 0.30, danceability: 0.60, acousticness: 0.15, instrumentalness: 0.00, speechiness: 0.18, loudness: -7.5 },
  { trackId: "tr_04", energy: 0.71, tempo: 97, valence: 0.72, danceability: 0.79, acousticness: 0.22, instrumentalness: 0.00, speechiness: 0.08, loudness: -5.8 },
  { trackId: "tr_05", energy: 0.58, tempo: 104, valence: 0.80, danceability: 0.68, acousticness: 0.55, instrumentalness: 0.00, speechiness: 0.04, loudness: -6.3 },
  { trackId: "tr_06", energy: 0.40, tempo: 85, valence: 0.65, danceability: 0.74, acousticness: 0.78, instrumentalness: 0.82, speechiness: 0.03, loudness: -14.2 },
  { trackId: "tr_07", energy: 0.74, tempo: 116, valence: 0.55, danceability: 0.82, acousticness: 0.18, instrumentalness: 0.00, speechiness: 0.22, loudness: -4.9 },
  { trackId: "tr_08", energy: 0.44, tempo: 78, valence: 0.33, danceability: 0.63, acousticness: 0.48, instrumentalness: 0.00, speechiness: 0.04, loudness: -10.5 },
  { trackId: "tr_09", energy: 0.45, tempo: 80, valence: 0.36, danceability: 0.61, acousticness: 0.60, instrumentalness: 0.00, speechiness: 0.03, loudness: -11.1 },
  { trackId: "tr_10", energy: 0.53, tempo: 94, valence: 0.68, danceability: 0.70, acousticness: 0.40, instrumentalness: 0.02, speechiness: 0.07, loudness: -8.8 },
  { trackId: "tr_11", energy: 0.66, tempo: 108, valence: 0.50, danceability: 0.75, acousticness: 0.12, instrumentalness: 0.01, speechiness: 0.09, loudness: -6.7 },
  { trackId: "tr_12", energy: 0.42, tempo: 86, valence: 0.55, danceability: 0.58, acousticness: 0.70, instrumentalness: 0.88, speechiness: 0.03, loudness: -13.4 },
];

// ── Genre buckets per track ───────────────────────────────────────────────────

export const mockGenres: Record<string, GenreBucket[]> = {
  tr_01: ["rnb", "neosoul"],
  tr_02: ["neosoul", "rnb"],
  tr_03: ["hiphop"],
  tr_04: ["neosoul", "chillpop"],
  tr_05: ["chillpop"],
  tr_06: ["lofi"],
  tr_07: ["hiphop"],
  tr_08: ["rnb", "neosoul"],
  tr_09: ["rnb"],
  tr_10: ["neosoul", "rnb"],
  tr_11: ["hiphop", "chillpop"],
  tr_12: ["lofi", "nujazz"],
};
