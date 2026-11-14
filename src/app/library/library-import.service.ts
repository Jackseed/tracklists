import { Injectable, inject } from '@angular/core';
import { httpsCallable } from 'firebase/functions';
import { BehaviorSubject, combineLatest, Observable, timer } from 'rxjs';
import { distinctUntilChanged, map } from 'rxjs/operators';
import { ImportPhase, LibraryImport } from '../auth/+state/auth.model';
import { AuthQuery } from '../auth/+state/auth.query';
import { callableErrorMessage, FUNCTIONS } from '../core/firebase';

/** What the app shows about the Spotify library import. */
export type ImportView =
  | { kind: 'idle' }
  | { kind: 'running'; percent: number; label: string; detail: string }
  | { kind: 'error'; message: string; needsLogin: boolean };

/**
 * The server refreshes `import.updatedAt` every few seconds while it works. If
 * it stops changing for this long, the import died (crash, timeout).
 */
export const STALLED_AFTER_MS = 60_000;
const CALL_TIMEOUT_MS = 60 * 60 * 1000;

const PHASE_LABELS: Record<ImportPhase, string> = {
  starting: 'Connecting to Spotify',
  playlists: 'Reading your playlists',
  tracks: 'Reading your playlists',
  details: 'Loading audio features and genres',
  saving: 'Saving your library',
};

interface Local {
  /** The user asked for an import; `fromRunId` is the last run known at that moment. */
  starting: boolean;
  fromRunId?: string;
  /** The request failed before the server could record anything. */
  error: { message: string; needsLogin: boolean } | null;
}

/** Pure mapping from the stored import state to what is displayed; `stalled` comes from the heartbeat watch. */
export function toImportView(state: LibraryImport | undefined, local: Local, stalled: boolean): ImportView {
  if (local.error) return { kind: 'error', ...local.error };
  if (state?.status === 'running' && !stalled) {
    // Playlists repeat the same songs: the count shown is the one of different tracks.
    const found = state.found ?? 0;
    const detail = found === 0 ? '' : state.phase === 'tracks' ? `${found.toLocaleString('en')} tracks found` : `${found.toLocaleString('en')} tracks`;
    return {
      kind: 'running',
      percent: Math.max(1, Math.min(99, Math.round(state.percent ?? 0))),
      label: PHASE_LABELS[state.phase] ?? PHASE_LABELS.starting,
      detail: state.phase === 'starting' || state.phase === 'playlists' ? '' : detail,
    };
  }
  // Until the server reports on the run that was just requested (a new run id), show it as starting.
  if (local.starting && state?.runId === local.fromRunId) return { kind: 'running', percent: 1, label: PHASE_LABELS.starting, detail: '' };
  if (state?.status === 'running' && stalled) {
    return { kind: 'error', message: 'Loading your library was interrupted. Please try again.', needsLogin: false };
  }
  if (state?.status === 'error') {
    return {
      kind: 'error',
      message: state.error?.message ?? 'Something went wrong while loading your library. Please try again.',
      needsLogin: state.error?.code === 'spotify-reauth',
    };
  }
  return { kind: 'idle' };
}

@Injectable({ providedIn: 'root' })
export class LibraryImportService {
  private functions = inject(FUNCTIONS);
  private authQuery = inject(AuthQuery);

  private readonly local = new BehaviorSubject<Local>({ starting: false, error: null });
  private heartbeat: { runId: string; value: number; seenAt: number } | null = null;

  /** State of the import as stored on the user document. */
  readonly state$: Observable<LibraryImport | undefined> = this.authQuery.selectActive((user) => user?.import);

  readonly view$: Observable<ImportView> = combineLatest([this.state$, this.local, timer(0, 5000)]).pipe(
    map(([state, local]) => toImportView(state, local, this.isStalled(state))),
    distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b))
  );

  /** Warnings of the last completed import (e.g. audio features unavailable), keyed by run. */
  readonly warnings$: Observable<{ runId: string; warnings: string[] } | null> = this.state$.pipe(
    map((state) => (state?.status === 'done' && state.warnings?.length ? { runId: state.runId, warnings: state.warnings } : null)),
    distinctUntilChanged((a, b) => a?.runId === b?.runId)
  );

  /**
   * Asks the server to import the Spotify library. Progress and outcome come
   * through `view$` (from the user document), not from this call: the import
   * goes on if the connection drops or the tab is closed.
   */
  async start(): Promise<void> {
    if (this.local.value.starting) return;
    const startedRunId = this.authQuery.getActive()?.import?.runId;
    this.local.next({ starting: true, fromRunId: startedRunId, error: null });
    try {
      await httpsCallable(this.functions, 'importLibrary', { timeout: CALL_TIMEOUT_MS })();
      this.local.next({ starting: false, error: null });
    } catch (error) {
      const code = String((error as { code?: string })?.code ?? '');
      const details = (error as { details?: { code?: string } })?.details;
      const current = this.authQuery.getActive()?.import;
      // Already running (other tab, double click) or recorded by the server: the user document tells the story.
      const recorded = code === 'functions/already-exists' || (current && current.runId !== startedRunId);
      if (recorded) {
        this.local.next({ starting: false, error: null });
        return;
      }
      console.error('[LibraryImport] could not start the import:', error);
      const needsLogin = code === 'functions/unauthenticated' || details?.code === 'spotify-reauth';
      const message =
        code === 'functions/unavailable' || code === 'functions/deadline-exceeded'
          ? 'The server could not be reached. Check your connection and try again.'
          : (code !== 'functions/internal' && callableErrorMessage(error)) || 'Something went wrong while loading your library. Please try again.';
      this.local.next({ starting: false, error: { message, needsLogin } });
    }
  }

  /** Forgets a failed attempt (the error screen was acknowledged). */
  dismissError(): void {
    if (this.local.value.error) this.local.next({ ...this.local.value, error: null });
  }

  /**
   * True when a "running" import stopped giving signs of life. Based on when
   * this browser last saw the heartbeat change, so clock differences with the
   * server do not matter.
   */
  private isStalled(state: LibraryImport | undefined): boolean {
    if (state?.status !== 'running') {
      this.heartbeat = null;
      return false;
    }
    const value = state.updatedAt?.toMillis() ?? 0;
    if (!this.heartbeat || this.heartbeat.runId !== state.runId || this.heartbeat.value !== value) {
      this.heartbeat = { runId: state.runId, value, seenAt: Date.now() };
    }
    return Date.now() - this.heartbeat.seenAt > STALLED_AFTER_MS;
  }
}
