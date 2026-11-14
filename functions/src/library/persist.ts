import { FieldValue, Firestore } from 'firebase-admin/firestore';
import { FetchedLibrary } from './fetch';
import { genreDocId, isValidDocId } from './model';

/** Version of the track documents written by this importer. */
export const TRACK_SCHEMA_VERSION = 2;

/**
 * A Firestore document is limited to 1 MiB: a `trackIds` array holds ~45 000
 * Spotify ids at most. Longer lists are truncated (with a warning).
 */
export const MAX_TRACK_IDS_PER_DOC = 40_000;

export interface ExistingLibrary {
  /** Tracks currently linked to the user in Firestore. */
  trackIds: Set<string>;
  /** Among them, tracks written by this importer that already carry audio features. */
  withAudioFeatures: Set<string>;
}

export interface PersistStats {
  tracksWritten: number;
  tracksUnlinked: number;
  playlistsWritten: number;
  genreDocsWritten: number;
  genreDocsDeleted: number;
}

export class PersistError extends Error {
  constructor(readonly failures: number, sample: string) {
    super(`${failures} Firestore write(s) failed, e.g. ${sample}`);
    this.name = 'PersistError';
  }
}

/** What Firestore already knows about the user's library (ids only, no track payload). */
export async function readExistingLibrary(db: Firestore, uid: string): Promise<ExistingLibrary> {
  const snapshot = await db.collection('tracks').where('userIds', 'array-contains', uid).select('v', 'tempo').get();
  const trackIds = new Set<string>();
  const withAudioFeatures = new Set<string>();
  for (const doc of snapshot.docs) {
    trackIds.add(doc.id);
    // Older documents are not trusted: their audio features were matched by position.
    if (doc.get('v') === TRACK_SCHEMA_VERSION && typeof doc.get('tempo') === 'number') withAudioFeatures.add(doc.id);
  }
  return { trackIds, withAudioFeatures };
}

async function forEachPooled<T>(items: T[], workers: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(workers, items.length) }, async () => {
      while (next < items.length) await fn(items[next++]);
    })
  );
}

/**
 * Writes the fetched library to Firestore and resolves once every write is
 * acknowledged:
 *  - `tracks/{id}`: merged, and linked to the user through `userIds`;
 *  - tracks that left the library are unlinked from the user;
 *  - `playlists/{id}` with their `trackIds`;
 *  - `playlists/{id}/genres/{genre}`: rebuilt from the tracks of each playlist.
 */
export async function persistLibrary(
  db: Firestore,
  uid: string,
  library: FetchedLibrary,
  existing: ExistingLibrary,
  onProgress: (done: number, total: number) => void = () => undefined
): Promise<PersistStats> {
  const stats: PersistStats = { tracksWritten: 0, tracksUnlinked: 0, playlistsWritten: 0, genreDocsWritten: 0, genreDocsDeleted: 0 };
  const failures: string[] = [];

  // Genres of every playlist, computed in memory: genre -> ids of the playlist's tracks having it.
  const playlists = library.playlists.map((playlist) => {
    if (playlist.trackIds.length <= MAX_TRACK_IDS_PER_DOC) return playlist;
    library.warnings.push(`"${playlist.name}" has ${playlist.trackIds.length} tracks: only the first ${MAX_TRACK_IDS_PER_DOC} are kept.`);
    return { ...playlist, trackIds: playlist.trackIds.slice(0, MAX_TRACK_IDS_PER_DOC) };
  });
  const genresByPlaylist = new Map<string, Map<string, string[]>>();
  let genreDocs = 0;
  for (const playlist of playlists) {
    const genres = new Map<string, string[]>();
    for (const trackId of playlist.trackIds) {
      for (const genre of library.tracks.get(trackId)?.genres ?? []) {
        const id = genreDocId(genre);
        if (!isValidDocId(id)) continue;
        const ids = genres.get(id);
        if (ids) ids.push(trackId);
        else genres.set(id, [trackId]);
      }
    }
    genresByPlaylist.set(playlist.id, genres);
    genreDocs += genres.size;
  }

  const removedTrackIds = [...existing.trackIds].filter((id) => !library.tracks.has(id));
  let total = library.tracks.size + removedTrackIds.length + playlists.length + genreDocs;
  let done = 0;
  onProgress(0, total);

  const writer = db.bulkWriter({ throttling: { initialOpsPerSecond: 1000, maxOpsPerSecond: 5000 } });
  const track = (operation: Promise<unknown>, label: string, onSuccess: () => void, ignoreNotFound = false) =>
    operation.then(
      () => {
        onSuccess();
        onProgress(++done, total);
      },
      (error: { code?: number; message?: string }) => {
        // gRPC NOT_FOUND: the track document disappeared meanwhile, nothing left to unlink.
        if (!(ignoreNotFound && error?.code === 5)) failures.push(`${label}: ${error?.message ?? error}`);
        onProgress(++done, total);
      }
    );

  const tracksCollection = db.collection('tracks');
  for (const item of library.tracks.values()) {
    void track(
      writer.set(tracksCollection.doc(item.id), { ...item, userIds: FieldValue.arrayUnion(uid), v: TRACK_SCHEMA_VERSION }, { merge: true }),
      `tracks/${item.id}`,
      () => stats.tracksWritten++
    );
  }
  for (const id of removedTrackIds) {
    void track(writer.update(tracksCollection.doc(id), { userIds: FieldValue.arrayRemove(uid) }), `tracks/${id}`, () => stats.tracksUnlinked++, true);
  }

  const playlistsCollection = db.collection('playlists');
  for (const playlist of playlists) {
    void track(writer.set(playlistsCollection.doc(playlist.id), playlist, { merge: true }), `playlists/${playlist.id}`, () => stats.playlistsWritten++);
  }

  // Genre documents are replaced as a whole; the ones that no longer apply are deleted.
  await forEachPooled(playlists, 16, async (playlist) => {
    const genres = genresByPlaylist.get(playlist.id)!;
    const collection = playlistsCollection.doc(playlist.id).collection('genres');
    const current = await collection.select().get();
    for (const doc of current.docs) {
      if (genres.has(doc.id)) continue;
      total++;
      void track(writer.delete(doc.ref), doc.ref.path, () => stats.genreDocsDeleted++);
    }
    for (const [id, trackIds] of genres) {
      void track(writer.set(collection.doc(id), { id, trackIds }), `${collection.path}/${id}`, () => stats.genreDocsWritten++);
    }
  });

  await writer.close();
  if (failures.length > 0) throw new PersistError(failures.length, failures[0]);
  return stats;
}
