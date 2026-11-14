import { LibraryImport } from '../auth/+state/auth.model';
import { toImportView } from './library-import.service';

const none = { starting: false, error: null };
const state = (overrides: Partial<LibraryImport>): LibraryImport => ({ status: 'running', runId: 'run-1', phase: 'tracks', percent: 30, done: 8400, total: 20000, found: 3210, ...overrides });

describe('toImportView', () => {
  it('is idle without any import', () => {
    expect(toImportView(undefined, none, false)).toEqual({ kind: 'idle' });
    expect(toImportView(state({ status: 'done', percent: 100 }), none, false)).toEqual({ kind: 'idle' });
  });

  it('describes a running import with the number of different tracks, not of playlist entries', () => {
    expect(toImportView(state({}), none, false)).toEqual({ kind: 'running', percent: 30, label: 'Reading your playlists', detail: '3,210 tracks found' });
    expect(toImportView(state({ phase: 'playlists', percent: 2, done: 50, total: 300, found: 0 }), none, false)).toEqual({ kind: 'running', percent: 2, label: 'Reading your playlists', detail: '' });
    expect(toImportView(state({ phase: 'details', percent: 60, found: 4922 }), none, false)).toEqual({ kind: 'running', percent: 60, label: 'Loading audio features and genres', detail: '4,922 tracks' });
    expect(toImportView(state({ phase: 'saving', percent: 90, found: 4922 }), none, false)).toEqual({ kind: 'running', percent: 90, label: 'Saving your library', detail: '4,922 tracks' });
  });

  it('works with an import started before the count existed', () => {
    expect(toImportView(state({ found: undefined }), none, false)).toMatchObject({ label: 'Reading your playlists', detail: '' });
  });

  it('never shows 0 % or 100 % while running', () => {
    expect(toImportView(state({ percent: 0 }), none, false)).toMatchObject({ percent: 1 });
    expect(toImportView(state({ percent: 100 }), none, false)).toMatchObject({ percent: 99 });
  });

  it('shows progress as soon as the user asked, before the server reports', () => {
    expect(toImportView(undefined, { starting: true, error: null }, false)).toEqual({ kind: 'running', percent: 1, label: 'Connecting to Spotify', detail: '' });
    // A previous failure does not hide the new attempt.
    const failed = state({ status: 'error', error: { code: 'spotify-unavailable', message: 'Spotify did not answer.' } });
    expect(toImportView(failed, { starting: true, fromRunId: 'run-1', error: null }, false).kind).toBe('running');
  });

  it('stops showing "starting" once the server reported the end of the requested run', () => {
    // The HTTP call is still pending, but the user document already says the new run is done.
    const done = state({ status: 'done', runId: 'run-2', percent: 100 });
    expect(toImportView(done, { starting: true, fromRunId: 'run-1', error: null }, false)).toEqual({ kind: 'idle' });
  });

  it('reports an import that stopped giving signs of life', () => {
    expect(toImportView(state({}), none, true)).toEqual({ kind: 'error', message: 'Loading your library was interrupted. Please try again.', needsLogin: false });
  });

  it('reports the failure recorded by the server', () => {
    const failed = state({ status: 'error', error: { code: 'spotify-rate-limited', message: 'Spotify is temporarily limiting requests.' } });
    expect(toImportView(failed, none, false)).toEqual({ kind: 'error', message: 'Spotify is temporarily limiting requests.', needsLogin: false });
    const expired = state({ status: 'error', error: { code: 'spotify-reauth', message: 'Your Spotify session has expired.' } });
    expect(toImportView(expired, none, false)).toMatchObject({ kind: 'error', needsLogin: true });
  });

  it('reports a request that failed before reaching the server', () => {
    const local = { starting: false, error: { message: 'The server could not be reached.', needsLogin: false } };
    expect(toImportView(state({ status: 'done' }), local, false)).toEqual({ kind: 'error', message: 'The server could not be reached.', needsLogin: false });
  });
});
