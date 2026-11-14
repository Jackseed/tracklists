import {
  SpotifyAuthError,
  SpotifyClient,
  SpotifyHttpError,
  SpotifyRateLimitError,
  SpotifyUnavailableError,
} from '../spotify/client';
import {
  AudioFeatures,
  isSpotifyId,
  isValidDocId,
  playlistEntryCount,
  skipReason,
  SpotifyPaging,
  SpotifyRawArtist,
  SpotifyRawAudioFeatures,
  SpotifyRawPlaylist,
  SpotifyTrackEntry,
  StoredPlaylist,
  StoredTrack,
  toAudioFeatures,
  toStoredTrack,
} from './model';

export type FetchPhase = 'playlists' | 'tracks' | 'details';

export interface FetchOptions {
  /** Spotify user id, used to name the synthetic "Liked tracks" playlist. */
  uid: string;
  /** Audio features never change: tracks that already have them are not requested again. */
  hasAudioFeatures?: (trackId: string) => boolean;
  /** `found`: different tracks found so far (exact once the `tracks` phase is over). */
  onProgress?: (phase: FetchPhase, done: number, total: number, found: number) => void;
}

export interface FetchStats {
  playlists: number;
  skippedPlaylists: number;
  likedTracks: number;
  tracks: number;
  /** Playlist entries that are not importable tracks. */
  skippedEntries: { removed: number; local: number; episode: number; invalid: number };
  audioFeaturesFetched: number;
  artistsFetched: number;
}

export interface FetchedLibrary {
  /** The user's Spotify playlists, followed by the synthetic "Liked tracks" playlist. */
  playlists: StoredPlaylist[];
  /** Unique tracks by id, liked tracks first. */
  tracks: Map<string, StoredTrack>;
  /** Problems that did not prevent the import (missing details, unreadable playlists...). */
  warnings: string[];
  stats: FetchStats;
}

const PLAYLISTS_PAGE = 50;
const SAVED_TRACKS_PAGE = 50;
const PLAYLIST_ITEMS_PAGE = 100;
const AUDIO_FEATURES_BATCH = 100;
const ARTISTS_BATCH = 50;

/** Only what `toStoredTrack` reads: full track objects are ~10x bigger. */
const TRACK_FIELDS = 'id,name,type,uri,is_local,duration_ms,popularity,album(id,name,images,release_date,release_date_precision),artists(id,name)';
const PLAYLIST_ITEMS_FIELDS = `total,limit,offset,next,items(added_at,is_local,item(${TRACK_FIELDS}))`;

type Query = Record<string, string | number | undefined>;

async function getPage<T>(client: SpotifyClient, path: string, query: Query): Promise<SpotifyPaging<T>> {
  const page = await client.get<SpotifyPaging<T>>(path, query);
  if (!page || !Array.isArray(page.items) || typeof page.total !== 'number') {
    throw new SpotifyUnavailableError(path, 'unexpected paging payload');
  }
  return page;
}

/**
 * Fetches every page of an offset-paginated collection. The first page gives
 * the total; the remaining pages are requested together (the client bounds the
 * actual concurrency and pace). Throws if any page cannot be fetched.
 */
async function fetchAllPages<T>(
  client: SpotifyClient,
  path: string,
  query: Query,
  pageSize: number,
  hooks: { onTotal?: (total: number) => void; onItems?: (items: T[]) => void } = {}
): Promise<T[]> {
  const first = await getPage<T>(client, path, { ...query, limit: pageSize, offset: 0 });
  hooks.onTotal?.(first.total);
  hooks.onItems?.(first.items);
  // Spotify may apply a smaller page size than the one requested.
  const step = first.limit > 0 ? Math.min(first.limit, pageSize) : pageSize;
  const offsets: number[] = [];
  for (let offset = step; offset < first.total; offset += step) offsets.push(offset);
  const rest = await Promise.all(
    offsets.map(async (offset) => {
      const page = await getPage<T>(client, path, { ...query, limit: step, offset });
      hooks.onItems?.(page.items);
      return page.items;
    })
  );
  return first.items.concat(...rest);
}

/** Runs `fn` over `items` with a few workers, stopping early when `shouldStop` says so. */
async function forEachPooled<T>(items: T[], workers: number, shouldStop: () => boolean, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(workers, items.length) }, async () => {
      while (next < items.length && !shouldStop()) await fn(items[next++]);
    })
  );
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

const isSpotifyError = (error: unknown) =>
  error instanceof SpotifyHttpError ||
  error instanceof SpotifyRateLimitError ||
  error instanceof SpotifyUnavailableError ||
  error instanceof SpotifyAuthError;

/**
 * "Several ..." endpoints keep the order of the requested ids and answer `null`
 * for unknown ones, but reject the whole batch with a 400 when a single id is
 * malformed. In that case the batch is split until the culprit is isolated.
 */
async function fetchByIds<T>(client: SpotifyClient, path: string, key: string, ids: string[]): Promise<Array<T | null>> {
  try {
    const payload = await client.get<Record<string, Array<T | null> | undefined>>(`${path}?ids=${ids.join(',')}`);
    return payload?.[key] ?? [];
  } catch (error) {
    if (!(error instanceof SpotifyHttpError) || error.status !== 400) throw error;
    if (ids.length === 1) return [];
    const middle = ids.length >> 1;
    const halves = await Promise.all([
      fetchByIds<T>(client, path, key, ids.slice(0, middle)),
      fetchByIds<T>(client, path, key, ids.slice(middle)),
    ]);
    return halves[0].concat(halves[1]);
  }
}

/**
 * Details (audio features, artist genres) are a best effort: the library itself
 * is already known at this point, so a failure here only produces a warning.
 */
async function fetchDetails<T extends { id?: string }>(
  client: SpotifyClient,
  what: string,
  path: string,
  key: string,
  ids: string[],
  batchSize: number,
  onItem: (item: T & { id: string }) => void,
  onBatchDone: (count: number) => void,
  warnings: string[]
): Promise<void> {
  let stopReason: string | undefined;
  let failedIds = 0;
  let handled = 0;
  await forEachPooled(chunk(ids, batchSize), 8, () => stopReason !== undefined, async (batch) => {
    try {
      const items = await fetchByIds<T>(client, path, key, batch);
      for (const item of items) if (item && typeof item.id === 'string') onItem(item as T & { id: string });
    } catch (error) {
      if (!isSpotifyError(error)) throw error;
      failedIds += batch.length;
      if (error instanceof SpotifyHttpError && [403, 404, 410].includes(error.status)) {
        stopReason = `Spotify does not give this app access to ${what} (HTTP ${error.status})`;
      } else if (error instanceof SpotifyRateLimitError) {
        stopReason = `Spotify rate limit reached while loading ${what} (retry in ${error.retryAfterSeconds}s)`;
      } else if (error instanceof SpotifyAuthError) {
        stopReason = `Spotify session expired while loading ${what}`;
      }
    } finally {
      handled += batch.length;
      onBatchDone(batch.length);
    }
  });
  if (handled < ids.length) onBatchDone(ids.length - handled);
  if (stopReason) warnings.push(`${stopReason}: ${ids.length - handled + failedIds} of ${ids.length} missing.`);
  else if (failedIds > 0) warnings.push(`Spotify errors while loading ${what}: ${failedIds} of ${ids.length} missing.`);
}

/** Reads the whole library of the current user from Spotify. Nothing is written anywhere. */
export async function fetchLibrary(client: SpotifyClient, options: FetchOptions): Promise<FetchedLibrary> {
  const report = options.onProgress ?? (() => undefined);
  // Different tracks seen so far: the real size of the library, unlike the number of playlist entries.
  const foundIds = new Set<string>();
  const progress = (phase: FetchPhase, done: number, total: number) => report(phase, done, total, foundIds.size);
  const warnings: string[] = [];
  const skippedEntries = { removed: 0, local: 0, episode: 0, invalid: 0 };

  // --- 1. Playlists ----------------------------------------------------------
  progress('playlists', 0, 1);
  let playlistsTotal = 1;
  let playlistsDone = 0;
  const seenPlaylists = new Set<string>();
  const rawPlaylists = (
    await fetchAllPages<SpotifyRawPlaylist>(client, '/me/playlists', {}, PLAYLISTS_PAGE, {
      onTotal: (total) => (playlistsTotal = Math.max(1, total)),
      onItems: (items) => progress('playlists', (playlistsDone += items.length), playlistsTotal),
    })
  ).filter((playlist): playlist is SpotifyRawPlaylist & { id: string } => {
    if (!playlist || !isValidDocId(playlist.id) || seenPlaylists.has(playlist.id)) return false;
    seenPlaylists.add(playlist.id);
    return true;
  });

  // --- 2. Entries of every playlist and liked tracks, all at once -----------
  let entriesTotal = rawPlaylists.reduce((sum, playlist) => sum + (playlistEntryCount(playlist) ?? 0), 0);
  let entriesDone = 0;
  const onItems = (entries: SpotifyTrackEntry[]) => {
    for (const entry of entries) {
      if (entry && !skipReason(entry)) foundIds.add((entry.item ?? entry.track)!.id as string);
    }
    progress('tracks', Math.min((entriesDone += entries.length), entriesTotal), entriesTotal);
  };
  progress('tracks', 0, entriesTotal);

  // Older API flavours expose the track under `track` and ignore an `item(...)`
  // selection: in that case the playlist is read again without `fields`.
  let useFields = true;
  const fetchPlaylistEntries = async (playlist: SpotifyRawPlaylist & { id: string }): Promise<SpotifyTrackEntry[] | null> => {
    if (playlistEntryCount(playlist) === 0) return [];
    const path = `/playlists/${playlist.id}/items`;
    try {
      const withFields = useFields;
      const entries = await fetchAllPages<SpotifyTrackEntry>(client, path, withFields ? { fields: PLAYLIST_ITEMS_FIELDS } : {}, PLAYLIST_ITEMS_PAGE, { onItems });
      if (withFields && entries.length > 0 && !entries.some((entry) => entry && ('item' in entry || 'track' in entry))) {
        useFields = false;
        return await fetchAllPages<SpotifyTrackEntry>(client, path, {}, PLAYLIST_ITEMS_PAGE);
      }
      return entries;
    } catch (error) {
      // Deleted playlist, or one whose content this app may not read: skip it, keep the rest.
      if (error instanceof SpotifyHttpError && (error.status === 403 || error.status === 404)) return null;
      throw error;
    }
  };

  const [likedEntries, playlistEntries] = await Promise.all([
    fetchAllPages<SpotifyTrackEntry>(client, '/me/tracks', {}, SAVED_TRACKS_PAGE, {
      onTotal: (total) => (entriesTotal += total),
      onItems,
    }),
    Promise.all(rawPlaylists.map(fetchPlaylistEntries)),
  ]);

  // --- 3. Unique tracks ------------------------------------------------------
  const tracks = new Map<string, StoredTrack>();
  const collect = (entries: SpotifyTrackEntry[]): string[] => {
    const ids = new Set<string>();
    for (const entry of entries) {
      const reason = skipReason(entry ?? {});
      if (reason) {
        skippedEntries[reason]++;
        continue;
      }
      const raw = (entry.item ?? entry.track)!;
      const id = raw.id as string;
      if (!tracks.has(id)) tracks.set(id, toStoredTrack(raw, entry.added_at));
      ids.add(id);
    }
    return [...ids];
  };

  const likedTrackIds = collect(likedEntries);
  const playlists: StoredPlaylist[] = [];
  let skippedPlaylists = 0;
  rawPlaylists.forEach((raw, index) => {
    const entries = playlistEntries[index];
    if (entries === null) {
      skippedPlaylists++;
      return;
    }
    playlists.push({
      id: raw.id,
      name: typeof raw.name === 'string' ? raw.name : '',
      type: typeof raw.type === 'string' ? raw.type : 'playlist',
      description: raw.description ?? '',
      collaborative: raw.collaborative ?? false,
      public: raw.public ?? null,
      snapshot_id: raw.snapshot_id,
      uri: raw.uri,
      images: raw.images ?? [],
      owner: pickOwner(raw.owner),
      trackIds: collect(entries),
    });
  });
  playlists.push({ id: `${options.uid}LikedTracks`, name: 'Liked tracks', type: 'likedTracks', trackIds: likedTrackIds });
  if (skippedPlaylists > 0) warnings.push(`${skippedPlaylists} playlist(s) could not be read from Spotify and were skipped.`);

  // Exact from now on (also covers playlists read again without `fields`).
  for (const id of tracks.keys()) foundIds.add(id);

  // --- 4. Audio features and artist genres ----------------------------------
  const featureIds = [...tracks.keys()].filter((id) => isSpotifyId(id) && !options.hasAudioFeatures?.(id));
  const artistIds = [...new Set([...tracks.values()].map((track) => track.artists[0]?.id).filter(isSpotifyId))];
  const detailsTotal = featureIds.length + artistIds.length;
  let detailsDone = 0;
  const onBatchDone = (count: number) => progress('details', (detailsDone += count), detailsTotal);
  progress('details', 0, detailsTotal);

  const featuresByTrack = new Map<string, Partial<AudioFeatures>>();
  const genresByArtist = new Map<string, string[]>();
  await Promise.all([
    fetchDetails<SpotifyRawAudioFeatures>(client, 'audio features', '/audio-features', 'audio_features', featureIds, AUDIO_FEATURES_BATCH, (item) => featuresByTrack.set(item.id, toAudioFeatures(item)), onBatchDone, warnings),
    fetchDetails<SpotifyRawArtist>(client, 'artist genres', '/artists', 'artists', artistIds, ARTISTS_BATCH, (item) => genresByArtist.set(item.id, Array.isArray(item.genres) ? item.genres : []), onBatchDone, warnings),
  ]);

  // Details are attached by id, never by position.
  for (const track of tracks.values()) {
    const features = featuresByTrack.get(track.id);
    if (features) Object.assign(track, features);
    const artistId = track.artists[0]?.id;
    if (!isSpotifyId(artistId)) track.genres = [];
    else if (genresByArtist.has(artistId)) track.genres = genresByArtist.get(artistId);
    // Otherwise the artist could not be loaded: leave `genres` untouched in Firestore.
  }

  return {
    playlists,
    tracks,
    warnings,
    stats: {
      playlists: playlists.length,
      skippedPlaylists,
      likedTracks: likedTrackIds.length,
      tracks: tracks.size,
      skippedEntries,
      audioFeaturesFetched: featuresByTrack.size,
      artistsFetched: genresByArtist.size,
    },
  };
}

function pickOwner(owner: unknown): { id: string; display_name: string | null } | null {
  if (!owner || typeof owner !== 'object') return null;
  const { id, display_name } = owner as { id?: unknown; display_name?: unknown };
  return typeof id === 'string' ? { id, display_name: typeof display_name === 'string' ? display_name : null } : null;
}
