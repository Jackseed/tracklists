import { ImportView } from '../library/library-import.service';

/** Which screen the home page shows. */
export type HomeView =
  /** The Spotify library is being imported by the server. */
  | { kind: 'importing'; percent: number; label: string; detail: string }
  /** The library is being read from the browser cache or from Firestore. */
  | { kind: 'loading'; detail: string }
  | { kind: 'error'; message: string; needsLogin: boolean; retry: 'import' | 'load' }
  /** Nothing imported yet. */
  | { kind: 'empty' }
  | { kind: 'ready' };

export interface HomeViewInput {
  importView: ImportView;
  playlistsSynced: boolean;
  library: { loading: boolean; loaded: number; error: string | null };
  trackCount: number;
  playlistCount: number;
}

export function toHomeView({ importView, playlistsSynced, library, trackCount, playlistCount }: HomeViewInput): HomeView {
  if (importView.kind === 'running') return { kind: 'importing', percent: importView.percent, label: importView.label, detail: importView.detail };
  if (!playlistsSynced || library.loading) {
    return { kind: 'loading', detail: library.loaded > 0 ? `${library.loaded.toLocaleString('en')} tracks` : '' };
  }
  // A library on screen wins over a failed reload: the failure is only notified.
  if (trackCount > 0 && playlistCount > 0) return { kind: 'ready' };
  if (library.error) return { kind: 'error', message: library.error, needsLogin: false, retry: 'load' };
  if (importView.kind === 'error') return { kind: 'error', message: importView.message, needsLogin: importView.needsLogin, retry: 'import' };
  return { kind: 'empty' };
}
