import type { Playlist, Track } from "../types";

// The Python sidecar returns snake_case keys; the TypeScript types use camelCase.
// These helpers coerce either form so fetch sites don't need to know which one arrives.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizePlaylist(raw: any): Playlist {
  return {
    id: (raw.id ?? raw.playlist_id ?? "") as string,
    name: (raw.name ?? "") as string,
    description: (raw.description ?? raw.description) as string | undefined,
    coverUrl: (raw.coverUrl ?? raw.cover_url) as string | undefined,
    trackCount: Number(raw.trackCount ?? raw.track_count ?? 0),
    isPublic: Boolean(raw.isPublic ?? raw.is_public),
    snapshotId: (raw.snapshotId ?? raw.snapshot_id) as string | undefined,
    cachedAt: (raw.cachedAt ?? raw.cached_at) as number | undefined,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeTrack(raw: any): Track {
  return {
    id: (raw.id ?? null) as string | null,
    name: (raw.name ?? "") as string,
    artistNames: (raw.artistNames ?? raw.artist_names ?? []) as string[],
    albumName: (raw.albumName ?? raw.album_name) as string | undefined,
    albumArtUrl: (raw.albumArtUrl ?? raw.album_art_url) as string | undefined,
    durationMs: (raw.durationMs ?? raw.duration_ms) as number | undefined,
    popularity: raw.popularity as number | undefined,
    genreBucket: (raw.genreBucket ?? raw.genre_bucket) as string | undefined,
    isLocal: Boolean(raw.isLocal ?? raw.is_local),
  };
}
