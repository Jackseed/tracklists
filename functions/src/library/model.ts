/**
 * Shapes stored in Firestore (`tracks`, `playlists`, `playlists/{id}/genres`)
 * and the raw Spotify shapes they are built from.
 */

export interface Image {
  url: string;
  height: number | null;
  width: number | null;
}

export interface StoredArtist {
  id: string;
  name: string;
  images: Image[];
}

export interface StoredAlbum {
  id: string;
  name: string;
  images: Image[];
  genres: string[];
  release_year: number | null;
  release_date: string;
  release_date_precision: string;
}

export interface AudioFeatures {
  key: number;
  mode: number;
  time_signature: number;
  acousticness: number;
  danceability: number;
  energy: number;
  instrumentalness: number;
  liveness: number;
  loudness: number;
  speechiness: number;
  valence: number;
  tempo: number;
}

export interface StoredTrack extends Partial<AudioFeatures> {
  id: string;
  added_at: string;
  name: string;
  artists: StoredArtist[];
  album: StoredAlbum;
  duration_ms: number;
  popularity: number | null;
  uri: string;
  genres?: string[];
}

export interface StoredPlaylist {
  id: string;
  name: string;
  type: string;
  trackIds: string[];
  [spotifyField: string]: unknown;
}

// --- Raw Spotify payloads (only what we read) --------------------------------

export interface SpotifyPaging<T> {
  items: T[];
  total: number;
  limit: number;
  offset?: number;
  next?: string | null;
}

export interface SpotifyRawTrack {
  id?: string | null;
  name?: string;
  type?: string;
  uri?: string;
  is_local?: boolean;
  duration_ms?: number;
  popularity?: number | null;
  album?: {
    id?: string | null;
    name?: string;
    images?: Image[] | null;
    genres?: string[];
    release_date?: string | null;
    release_date_precision?: string | null;
  } | null;
  artists?: Array<{ id?: string | null; name?: string }> | null;
}

/** An entry of a playlist (`item` since February 2026, `track` before) or of the saved tracks. */
export interface SpotifyTrackEntry {
  added_at?: string | null;
  is_local?: boolean;
  item?: SpotifyRawTrack | null;
  track?: SpotifyRawTrack | null;
}

export interface SpotifyRawPlaylist {
  id?: string;
  name?: string;
  type?: string;
  /** Number of entries: `items` since February 2026, `tracks` before. */
  items?: { href?: string; total?: number };
  tracks?: { href?: string; total?: number };
  [field: string]: unknown;
}

export type SpotifyRawAudioFeatures = Partial<AudioFeatures> & { id?: string };

export interface SpotifyRawArtist {
  id?: string;
  genres?: string[];
}

// --- Normalisation -----------------------------------------------------------

/** Spotify ids are 22 base62 characters; batch endpoints answer 400 for anything else. */
export const isSpotifyId = (id: unknown): id is string => typeof id === 'string' && /^[0-9A-Za-z]{22}$/.test(id);

/** Ids that can safely be used as a Firestore document id. */
export function isValidDocId(id: unknown): id is string {
  return typeof id === 'string' && id.length > 0 && Buffer.byteLength(id) <= 1500 && !id.includes('/') && id !== '.' && id !== '..' && !/^__.*__$/.test(id);
}

/**
 * Why an entry is not an importable track, or `null` when it is one.
 * Playlists also contain tracks removed from the catalogue (`null`), local
 * files (no id) and podcast episodes (no audio features, no artist genres).
 */
export function skipReason(entry: SpotifyTrackEntry): 'removed' | 'local' | 'episode' | 'invalid' | null {
  const track = entry.item ?? entry.track;
  if (!track) return 'removed';
  if (entry.is_local || track.is_local) return 'local';
  if (track.type && track.type !== 'track') return 'episode';
  if (!isValidDocId(track.id)) return 'invalid';
  return null;
}

export function toStoredTrack(raw: SpotifyRawTrack, addedAt: string | null | undefined): StoredTrack {
  const album = raw.album ?? {};
  const releaseYear = album.release_date ? Number.parseInt(album.release_date.slice(0, 4), 10) : NaN;
  return {
    id: raw.id as string,
    added_at: addedAt ?? '',
    name: raw.name ?? '',
    artists: (raw.artists ?? []).map((artist) => ({ id: artist.id ?? '', name: artist.name ?? '', images: [] })),
    album: {
      id: album.id ?? '',
      name: album.name ?? '',
      images: (album.images ?? []).map((image) => ({ url: image.url, height: image.height ?? null, width: image.width ?? null })),
      genres: album.genres ?? [],
      release_year: Number.isFinite(releaseYear) ? releaseYear : null,
      release_date: album.release_date ?? '',
      release_date_precision: album.release_date_precision ?? '',
    },
    duration_ms: raw.duration_ms ?? 0,
    popularity: typeof raw.popularity === 'number' ? raw.popularity : null,
    uri: raw.uri ?? `spotify:track:${raw.id}`,
  };
}

const AUDIO_FEATURE_KEYS: Array<keyof AudioFeatures> = [
  'key', 'mode', 'time_signature', 'acousticness', 'danceability', 'energy',
  'instrumentalness', 'liveness', 'loudness', 'speechiness', 'valence', 'tempo',
];

export function toAudioFeatures(raw: SpotifyRawAudioFeatures): Partial<AudioFeatures> {
  const features: Partial<AudioFeatures> = {};
  for (const key of AUDIO_FEATURE_KEYS) {
    const value = raw[key];
    if (typeof value === 'number') features[key] = value;
  }
  return features;
}

/** Number of entries Spotify announces for a playlist, whatever the API flavour. */
export const playlistEntryCount = (playlist: SpotifyRawPlaylist): number | undefined => playlist.items?.total ?? playlist.tracks?.total;

/** Firestore document id for a genre (genre names may in theory contain a slash). */
export const genreDocId = (genre: string): string => genre.replaceAll('/', '-').trim();
