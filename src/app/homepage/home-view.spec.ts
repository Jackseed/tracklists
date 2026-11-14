import { ImportView } from '../library/library-import.service';
import { HomeViewInput, toHomeView } from './home-view';

const idle: ImportView = { kind: 'idle' };
const input = (overrides: Partial<HomeViewInput> = {}): HomeViewInput => ({
  importView: idle,
  playlistsSynced: true,
  library: { loading: false, loaded: 0, error: null },
  trackCount: 0,
  playlistCount: 0,
  ...overrides,
});

describe('toHomeView', () => {
  it('shows the app once tracks and playlists are there', () => {
    expect(toHomeView(input({ trackCount: 120, playlistCount: 3 }))).toEqual({ kind: 'ready' });
  });

  it('invites to load the library when nothing was imported yet', () => {
    expect(toHomeView(input())).toEqual({ kind: 'empty' });
  });

  it('shows the import progress, even over an existing library', () => {
    const importView: ImportView = { kind: 'running', percent: 42, label: 'Reading your playlists', detail: '3,210 tracks found' };
    expect(toHomeView(input({ importView, trackCount: 120, playlistCount: 3 }))).toEqual({ kind: 'importing', percent: 42, label: 'Reading your playlists', detail: '3,210 tracks found' });
  });

  it('waits for the playlists and for the tracks before deciding anything', () => {
    expect(toHomeView(input({ playlistsSynced: false }))).toEqual({ kind: 'loading', detail: '' });
    expect(toHomeView(input({ library: { loading: true, loaded: 7500, error: null } }))).toEqual({ kind: 'loading', detail: '7,500 tracks' });
  });

  it('never flashes the "load music" screen while the library is still loading', () => {
    // Just after a first import: the import is done but the tracks are not in the store yet.
    expect(toHomeView(input({ library: { loading: true, loaded: 0, error: null }, playlistCount: 3 })).kind).toBe('loading');
  });

  it('offers to retry a failed import when there is no library to show', () => {
    const importView: ImportView = { kind: 'error', message: 'Spotify did not answer.', needsLogin: false };
    expect(toHomeView(input({ importView }))).toEqual({ kind: 'error', message: 'Spotify did not answer.', needsLogin: false, retry: 'import' });
  });

  it('keeps showing the library when a reload fails', () => {
    const importView: ImportView = { kind: 'error', message: 'Spotify did not answer.', needsLogin: false };
    expect(toHomeView(input({ importView, trackCount: 120, playlistCount: 3 }))).toEqual({ kind: 'ready' });
  });

  it('offers to retry when the tracks could not be read', () => {
    const view = toHomeView(input({ library: { loading: false, loaded: 0, error: 'Your tracks could not be loaded.' }, playlistCount: 3 }));
    expect(view).toEqual({ kind: 'error', message: 'Your tracks could not be loaded.', needsLogin: false, retry: 'load' });
  });

  it('asks for a new Spotify login when the session expired', () => {
    const importView: ImportView = { kind: 'error', message: 'Your Spotify session has expired.', needsLogin: true };
    expect(toHomeView(input({ importView }))).toMatchObject({ kind: 'error', needsLogin: true });
  });
});
