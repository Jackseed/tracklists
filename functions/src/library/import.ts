import { randomUUID } from 'node:crypto';
import { DocumentReference, Firestore, Timestamp } from 'firebase-admin/firestore';
import { SpotifyAppConfig } from '../spotify/accounts';
import { SpotifyAuthError, SpotifyClient, SpotifyClientOptions, SpotifyHttpError, SpotifyRateLimitError, SpotifyUnavailableError } from '../spotify/client';
import { ReauthRequiredError, UserTokens } from '../tokens';
import { fetchLibrary, FetchPhase, FetchStats } from './fetch';
import { persistLibrary, PersistError, PersistStats, readExistingLibrary } from './persist';

export type ImportPhase = 'starting' | FetchPhase | 'saving';

/**
 * State of the library import, stored in `users/{uid}.import`. The web client
 * listens to it: the import does not depend on the HTTP call that started it.
 */
export interface ImportState {
  status: 'running' | 'done' | 'error';
  runId: string;
  phase: ImportPhase;
  /** Overall progress, 0-100. */
  percent: number;
  /** Progress inside the current phase (playlists, track entries, details, writes). */
  done: number;
  total: number;
  /** Different tracks found so far; exact from the `details` phase on. */
  found?: number;
  startedAt: Timestamp;
  /** Heartbeat: refreshed every few seconds while the import is alive. */
  updatedAt: Timestamp;
  finishedAt?: Timestamp;
  stats?: ImportStats;
  warnings?: string[];
  error?: ImportFailure;
}

export interface ImportStats extends FetchStats, PersistStats {
  durationSeconds: number;
  spotifyRequests: number;
  spotifyRateLimited: number;
}

export type ImportErrorCode = 'spotify-reauth' | 'spotify-rate-limited' | 'spotify-unavailable' | 'spotify-error' | 'storage-error' | 'internal';

export interface ImportFailure {
  code: ImportErrorCode;
  message: string;
  retryAfterSeconds?: number;
}

export class ImportAlreadyRunningError extends Error {
  constructor() {
    super('A library import is already running for this user');
    this.name = 'ImportAlreadyRunningError';
  }
}

/** Thrown by `runImport`; the same failure is stored in `users/{uid}.import.error`. */
export class ImportError extends Error {
  constructor(readonly failure: ImportFailure, options?: { cause?: unknown }) {
    super(failure.message, options);
    this.name = 'ImportError';
  }
}

/** A running import that has not sent a heartbeat for this long is considered dead. */
export const STALE_IMPORT_MS = 45_000;
const HEARTBEAT_MS = 5_000;
const MIN_PROGRESS_WRITE_MS = 1_500;

/** Share of the overall progress bar taken by each phase: [start, end]. */
const PHASE_RANGE: Record<ImportPhase, [number, number]> = {
  starting: [0, 1],
  playlists: [1, 4],
  tracks: [4, 55],
  details: [55, 75],
  saving: [75, 100],
};

export interface ImportDependencies {
  db: Firestore;
  uid: string;
  spotify: SpotifyAppConfig;
  /** Spotify pacing and retry settings; see SpotifyClient. */
  client?: Partial<Omit<SpotifyClientOptions, 'apiUrl' | 'getAccessToken'>>;
  log?: (message: string) => void;
}

/** Writes progress to the user document, at most every 1.5 s, plus a heartbeat. */
class ProgressReporter {
  private phase: ImportPhase = 'starting';
  private done = 0;
  private total = 0;
  private found = 0;
  private dirty = false;
  private lastWrite = 0;
  private writing?: Promise<void>;
  private timer?: NodeJS.Timeout;

  constructor(private readonly ref: DocumentReference, private readonly runId: string, private readonly startedAt: Timestamp) {}

  start(): void {
    this.timer = setInterval(() => void this.flush(true), HEARTBEAT_MS);
  }

  update(phase: ImportPhase, done: number, total: number, found = this.found): void {
    this.found = found;
    const phaseChanged = phase !== this.phase;
    this.phase = phase;
    this.done = done;
    this.total = total;
    this.dirty = true;
    if (phaseChanged || Date.now() - this.lastWrite >= MIN_PROGRESS_WRITE_MS) void this.flush(false);
  }

  snapshot(): Pick<ImportState, 'runId' | 'phase' | 'percent' | 'done' | 'total' | 'found' | 'startedAt'> {
    const [from, to] = PHASE_RANGE[this.phase];
    const ratio = this.total > 0 ? Math.min(1, this.done / this.total) : 0;
    return { runId: this.runId, phase: this.phase, percent: Math.floor(from + (to - from) * ratio), done: Math.min(this.done, this.total), total: this.total, found: this.found, startedAt: this.startedAt };
  }

  private flush(heartbeat: boolean): Promise<void> | undefined {
    // One write at a time: a pending change is picked up by the next tick.
    if (this.writing || (!this.dirty && !heartbeat)) return this.writing;
    this.dirty = false;
    this.lastWrite = Date.now();
    const state: ImportState = { status: 'running', ...this.snapshot(), updatedAt: Timestamp.now() };
    this.writing = this.ref
      .update({ import: state })
      // Progress is informative: never fail the import because of it.
      .then(() => undefined, () => undefined)
      .finally(() => (this.writing = undefined));
    return this.writing;
  }

  async stop(): Promise<void> {
    clearInterval(this.timer);
    await this.writing;
  }
}

async function acquire(db: Firestore, uid: string): Promise<{ runId: string; startedAt: Timestamp }> {
  const ref = db.doc(`users/${uid}`);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const current = snapshot.get('import') as ImportState | undefined;
    const heartbeat = current?.updatedAt instanceof Timestamp ? current.updatedAt.toMillis() : 0;
    if (current?.status === 'running' && Date.now() - heartbeat < STALE_IMPORT_MS) throw new ImportAlreadyRunningError();
    const now = Timestamp.now();
    const state: ImportState = { status: 'running', runId: randomUUID(), phase: 'starting', percent: 0, done: 0, total: 0, startedAt: now, updatedAt: now };
    // Replaces the whole `import` field (no leftovers from the previous run), and works
    // even if the user document does not exist yet.
    transaction.set(ref, { import: state }, { mergeFields: ['import'] });
    return { runId: state.runId, startedAt: now };
  });
}

export function describeFailure(error: unknown): ImportFailure {
  if (error instanceof ReauthRequiredError || error instanceof SpotifyAuthError) {
    return { code: 'spotify-reauth', message: 'Your Spotify session has expired. Please log in to Spotify again.' };
  }
  if (error instanceof SpotifyRateLimitError) {
    return {
      code: 'spotify-rate-limited',
      message: `Spotify is temporarily limiting requests. Please try again in ${Math.ceil(error.retryAfterSeconds / 60)} minute(s).`,
      retryAfterSeconds: error.retryAfterSeconds,
    };
  }
  if (error instanceof SpotifyUnavailableError) {
    return { code: 'spotify-unavailable', message: 'Spotify did not answer. Please try again in a moment.' };
  }
  if (error instanceof SpotifyHttpError) {
    return { code: 'spotify-error', message: `Spotify refused a request (HTTP ${error.status}).` };
  }
  if (error instanceof PersistError) {
    return { code: 'storage-error', message: 'Your library could not be saved completely. Please try again.' };
  }
  return { code: 'internal', message: 'Something went wrong while loading your library. Please try again.' };
}

/**
 * Imports the Spotify library of a user into Firestore.
 *
 * Throws `ImportAlreadyRunningError` if an import is in progress, `ImportError`
 * for any other failure. Either way the outcome is in `users/{uid}.import`.
 */
export async function runImport(deps: ImportDependencies): Promise<{ stats: ImportStats; warnings: string[] }> {
  const { db, uid } = deps;
  const log = deps.log ?? (() => undefined);
  const userRef = db.doc(`users/${uid}`);
  const startedMs = Date.now();
  const { runId, startedAt } = await acquire(db, uid);
  const reporter = new ProgressReporter(userRef, runId, startedAt);
  reporter.start();

  const tokens = new UserTokens(db, uid, deps.spotify);
  const client = new SpotifyClient({
    apiUrl: deps.spotify.apiUrl,
    getAccessToken: (staleToken) => tokens.get(staleToken),
    log,
    ...deps.client,
  });

  try {
    const existing = await readExistingLibrary(db, uid);
    const library = await fetchLibrary(client, {
      uid,
      hasAudioFeatures: (trackId) => existing.withAudioFeatures.has(trackId),
      onProgress: (phase, done, total, found) => reporter.update(phase, done, total, found),
    });
    log(`Fetched ${library.tracks.size} tracks and ${library.playlists.length} playlists with ${client.stats.requests} Spotify requests`);

    const persisted = await persistLibrary(db, uid, library, existing, (done, total) => reporter.update('saving', done, total, library.tracks.size));
    await reporter.stop();

    const stats: ImportStats = {
      ...library.stats,
      ...persisted,
      durationSeconds: Math.round((Date.now() - startedMs) / 1000),
      spotifyRequests: client.stats.requests,
      spotifyRateLimited: client.stats.rateLimited,
    };
    const now = Timestamp.now();
    const state: ImportState = {
      status: 'done', runId, phase: 'saving', percent: 100, done: 1, total: 1, found: library.tracks.size,
      startedAt, updatedAt: now, finishedAt: now, stats, warnings: library.warnings,
    };
    // Written last, in one go: the client reloads its tracks when it sees it.
    await userRef.update({ import: state, playlistIds: library.playlists.map((playlist) => playlist.id), libraryUpdatedAt: now });
    return { stats, warnings: library.warnings };
  } catch (error) {
    await reporter.stop();
    const failure = describeFailure(error);
    log(`Import failed (${failure.code}): ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
    const now = Timestamp.now();
    const state: ImportState = { status: 'error', ...reporter.snapshot(), updatedAt: now, finishedAt: now, error: failure };
    await userRef.update({ import: state }).catch(() => undefined);
    throw new ImportError(failure, { cause: error });
  } finally {
    client.close();
  }
}
