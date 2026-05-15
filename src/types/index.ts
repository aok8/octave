export interface UserProfile {
  id: string;
  displayName: string;
  email?: string;
  avatarUrl?: string;
}

export interface Playlist {
  id: string;
  name: string;
  description?: string;
  coverUrl?: string;
  trackCount: number;
  isPublic: boolean;
  snapshotId?: string;
  cachedAt?: number;
}

export interface Track {
  id: string | null;
  name: string;
  artistNames: string[];
  albumName?: string;
  albumArtUrl?: string;
  durationMs?: number;
  popularity?: number;
  /** Octave genre bucket returned by the sidecar (e.g. "Neo-Soul", "Hip-Hop"). */
  genreBucket?: string;
  /** True for local files added from the user's computer — no Spotify ID. */
  isLocal?: boolean;
}

export interface AudioFeatures {
  trackId: string;
  energy: number;
  tempo: number;
  valence: number;
  danceability: number;
  acousticness: number;
  instrumentalness: number;
  speechiness: number;
  loudness: number;
  key?: number;
  mode?: number;
}

export type GenreBucket =
  | "rnb"
  | "neosoul"
  | "hiphop"
  | "chillpop"
  | "lofi"
  | "nujazz"
  | "other";

export type InteractionEventType =
  | "playlist_viewed"
  | "insights_viewed"
  | "track_played"
  | "track_skipped"
  | "genre_boosted"
  | "genre_filtered"
  | "slider_adjusted"
  | "playlist_exported";

export interface InteractionEvent {
  eventType: InteractionEventType;
  playlistId?: string;
  trackId?: string;
  eventData?: Record<string, unknown>;
  createdAt: number;
}
