import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** Typings for the bits of tools/fake-spotify/server.mjs used by the tests. */
export interface FakeTrack {
  id: string | null;
  type: string;
  is_local?: boolean;
  artists: Array<{ id: string | null }>;
}
export interface FakeLibrary {
  user: { id: string };
  artistsById: Map<string, { genres: string[] }>;
  tracksById: Map<string, FakeTrack>;
  features: Map<string, { tempo: number; danceability: number } | null>;
  playlists: Array<{ id: string; name: string; entries: Array<{ added_at: string; is_local: boolean; track: FakeTrack | null }> }>;
  liked: Array<{ added_at: string; track: FakeTrack }>;
}
export interface FakeOptions {
  seed?: number;
  tracks?: number;
  playlists?: number;
  liked?: number;
  latencyMs?: number;
  rateLimit?: number;
  errorRate?: number;
  tokenTtlS?: number;
  brokenPlaylists?: number;
  legacyEntries?: boolean;
  edgeCases?: boolean;
}
export interface FakeSpotify {
  options: Required<FakeOptions>;
  library: FakeLibrary;
  stats: { api: number; accepted: number; rateLimited: number; serverErrors: number; unauthorized: number; tokenRequests: number; maxInFlight: number; byRoute: Record<string, number> };
  origin: string;
  issueToken(): string;
  listen(port?: number): Promise<string>;
  resetStats(): void;
  resetRateLimitWindow(): void;
  close(): Promise<void>;
}
export interface Expected {
  playlists: Array<{ id: string; broken: boolean; trackIds: string[] }>;
  likedIds: string[];
  uniqueTrackIds: Set<string>;
}

interface FakeModule {
  createFakeSpotify(options?: FakeOptions): FakeSpotify;
  expectedLibrary(library: FakeLibrary, options?: FakeOptions): Expected;
}

let fakeModule: Promise<FakeModule> | undefined;
/** The fake server is plain ESM shared with the web app's dev tooling. */
export function loadFake(): Promise<FakeModule> {
  // Compiled tests live in functions/.test-build/test: the repository root is three levels up.
  const file = path.resolve(__dirname, '../../../tools/fake-spotify/server.mjs');
  fakeModule ??= import(pathToFileURL(file).href) as Promise<FakeModule>;
  return fakeModule;
}

export async function startFake(options: FakeOptions = {}): Promise<{ fake: FakeSpotify; expected: Expected }> {
  const { createFakeSpotify, expectedLibrary } = await loadFake();
  const fake = createFakeSpotify(options);
  await fake.listen(0);
  return { fake, expected: expectedLibrary(fake.library, fake.options) };
}

export const sorted = (ids: Iterable<string>) => [...ids].sort();

/**
 * Virtual clock for SpotifyClient: sleeping returns immediately and moves the
 * clock forward instead. A long sleep is a rate-limit pause, so the fake's
 * 30 s window is cleared, as it would be after really waiting.
 */
export function fastClock(fake: () => FakeSpotify | undefined) {
  let offset = 0;
  const sleeps: number[] = [];
  return {
    sleeps,
    now: () => Date.now() + offset,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      offset += ms;
      if (ms >= 900) fake()?.resetRateLimitWindow();
      await new Promise((resolve) => setImmediate(resolve));
    },
  };
}
