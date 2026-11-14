import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { FetchedLibrary, fetchLibrary } from '../../src/library/fetch';
import { SpotifyClient } from '../../src/spotify/client';
import { Expected, fastClock, FakeOptions, FakeSpotify, sorted, startFake } from '../helpers';

describe('fetchLibrary', () => {
  let fake: FakeSpotify | undefined;
  afterEach(async () => {
    await fake?.close();
    fake = undefined;
  });

  async function run(options: FakeOptions, fetchOptions: { hasAudioFeatures?: (id: string) => boolean } = {}) {
    const started = await startFake(options);
    fake = started.fake;
    const token = fake.issueToken();
    const clock = fastClock(() => fake);
    const client = new SpotifyClient({ apiUrl: `${fake.origin}/v1`, getAccessToken: async () => token, minIntervalMs: 0, maxConcurrent: 8, now: clock.now, sleep: clock.sleep });
    const progress: Array<[string, number, number, number]> = [];
    const library = await fetchLibrary(client, { uid: fake.library.user.id, onProgress: (phase, done, total, found) => progress.push([phase, done, total, found]), ...fetchOptions });
    return { library, expected: started.expected, fake, client, progress };
  }

  /** Every track must carry ITS audio features and the genres of ITS first artist. */
  function assertDetailsMatch(library: FetchedLibrary, server: FakeSpotify, featuresSkipped: (id: string) => boolean = () => false) {
    for (const track of library.tracks.values()) {
      const truth = server.library.tracksById.get(track.id);
      assert.ok(truth, `unknown track ${track.id}`);
      const features = server.library.features.get(track.id);
      if (features && !featuresSkipped(track.id)) {
        assert.equal(track.tempo, features.tempo, `tempo of ${track.id}`);
        assert.equal(track.danceability, features.danceability, `danceability of ${track.id}`);
      } else {
        assert.equal(track.tempo, undefined);
      }
      assert.deepEqual(track.genres, server.library.artistsById.get(truth.artists[0].id as string)!.genres, `genres of ${track.id}`);
    }
  }

  function assertLibraryMatches(library: FetchedLibrary, expected: Expected) {
    assert.deepEqual(sorted(library.tracks.keys()), sorted(expected.uniqueTrackIds));
    const liked = library.playlists.at(-1)!;
    assert.equal(liked.type, 'likedTracks');
    assert.equal(liked.id, 'fakeuserLikedTracks');
    assert.deepEqual(sorted(liked.trackIds), sorted(expected.likedIds));
    const readable = expected.playlists.filter((playlist) => !playlist.broken);
    assert.equal(library.playlists.length, readable.length + 1);
    for (const playlist of readable) {
      const got = library.playlists.find((candidate) => candidate.id === playlist.id);
      assert.ok(got, `missing playlist ${playlist.id}`);
      assert.deepEqual(sorted(got.trackIds), sorted(new Set(playlist.trackIds)));
    }
  }

  it('imports every playlist, liked track, audio feature and genre', async () => {
    const { library, expected, fake: server, progress } = await run({ tracks: 1200, playlists: 25, liked: 400 });
    assertLibraryMatches(library, expected);
    assertDetailsMatch(library, server);
    assert.deepEqual(library.warnings, []);
    assert.equal(library.stats.tracks, expected.uniqueTrackIds.size);
    // Removed track, local file and podcast episode of the first playlist are left out.
    assert.deepEqual(library.stats.skippedEntries, { removed: 1, local: 1, episode: 1, invalid: 0 });
    // Progress goes through the three phases and ends complete.
    assert.deepEqual([...new Set(progress.map(([phase]) => phase))], ['playlists', 'tracks', 'details']);
    const last = progress.at(-1)!;
    assert.equal(last[1], last[2]);
    // The number of different tracks grows while playlists are read, never above the real one...
    const found = progress.map(([, , , count]) => count);
    assert.deepEqual(found, [...found].sort((a, b) => a - b));
    assert.ok(progress.some(([phase, , , count]) => phase === 'tracks' && count > 0 && count < expected.uniqueTrackIds.size));
    // ...and is exact once they are all read, well below the number of playlist entries.
    assert.ok(progress.filter(([phase]) => phase === 'details').every(([, , , count]) => count === expected.uniqueTrackIds.size));
    const entries = progress.filter(([phase]) => phase === 'tracks').at(-1)![2];
    assert.ok(entries > expected.uniqueTrackIds.size, `${entries} entries for ${expected.uniqueTrackIds.size} tracks`);
  });

  it('stores what the web client needs on each track', async () => {
    const { library } = await run({ tracks: 60, playlists: 3, liked: 10 });
    const track = [...library.tracks.values()][0];
    assert.match(track.uri, /^spotify:track:/);
    assert.ok(track.name.length > 0);
    assert.ok(track.artists[0].name.length > 0);
    assert.equal(track.album.images.length, 3);
    assert.equal(typeof track.album.release_year, 'number');
    assert.equal(typeof track.duration_ms, 'number');
    assert.ok(track.added_at.length > 0);
  });

  it('survives rate limiting and server errors without losing or mixing up anything', async () => {
    const { library, expected, fake: server, client } = await run({ tracks: 3000, playlists: 40, liked: 800, rateLimit: 60, errorRate: 0.05 });
    assertLibraryMatches(library, expected);
    assertDetailsMatch(library, server);
    assert.deepEqual(library.warnings, []);
    assert.ok(client.stats.rateLimited > 0 && client.stats.retries > 0, 'the scenario should have triggered 429s and retries');
  });

  it('skips a playlist that Spotify does not let us read, and says so', async () => {
    const { library, expected } = await run({ tracks: 600, playlists: 10, liked: 100, brokenPlaylists: 2 });
    assertLibraryMatches(library, expected);
    assert.equal(library.stats.skippedPlaylists, 2);
    assert.match(library.warnings.join('\n'), /2 playlist\(s\) could not be read/);
  });

  it('reads playlists whose entries only expose the legacy `track` key', async () => {
    const { library, expected, fake: server } = await run({ tracks: 600, playlists: 10, liked: 100, legacyEntries: true });
    assertLibraryMatches(library, expected);
    assertDetailsMatch(library, server);
  });

  it('does not request audio features that are already stored', async () => {
    const known = new Set<string>();
    const first = await run({ tracks: 500, playlists: 6, liked: 100 });
    for (const [id, track] of first.library.tracks) if (track.tempo !== undefined) known.add(id);
    await first.fake.close();
    const second = await run({ tracks: 500, playlists: 6, liked: 100 }, { hasAudioFeatures: (id) => known.has(id) });
    // Only the ~1% of tracks without analysis are asked again: one batch at most.
    assert.ok((second.fake.stats.byRoute['GET /audio-features'] ?? 0) <= 1);
    assertDetailsMatch(second.library, second.fake, (id) => known.has(id));
  });

  it('handles an empty library', async () => {
    const started = await startFake({ tracks: 1, playlists: 1, liked: 0, edgeCases: false });
    fake = started.fake;
    fake.library.playlists.length = 0;
    fake.library.liked.length = 0;
    const token = fake.issueToken();
    const client = new SpotifyClient({ apiUrl: `${fake.origin}/v1`, getAccessToken: async () => token, minIntervalMs: 0 });
    const library = await fetchLibrary(client, { uid: 'fakeuser' });
    assert.equal(library.tracks.size, 0);
    assert.deepEqual(library.playlists.map((playlist) => playlist.id), ['fakeuserLikedTracks']);
  });
});
