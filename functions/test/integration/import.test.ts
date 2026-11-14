/**
 * End-to-end tests of the library import against the Firestore and Auth
 * emulators and the fake Spotify server. Run with `npm run test:integration`
 * from the repository root (it starts the emulators).
 */
import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { Firestore, getFirestore, Timestamp } from 'firebase-admin/firestore';
import { ImportAlreadyRunningError, ImportError, ImportState, runImport } from '../../src/library/import';
import { TRACK_SCHEMA_VERSION } from '../../src/library/persist';
import { exchangeAuthorizationCode, fetchProfile, SpotifyAppConfig } from '../../src/spotify/accounts';
import { upsertUser } from '../../src/users';
import { Expected, fastClock, FakeOptions, FakeSpotify, sorted, startFake } from '../helpers';

const PROJECT = process.env.GCLOUD_PROJECT ?? 'demo-tracklists';
const UID = 'fakeuser';

describe('library import (emulators)', { concurrency: false }, () => {
  let db: Firestore;
  let fake: FakeSpotify;
  let expected: Expected;

  before(() => {
    assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'FIRESTORE_EMULATOR_HOST is not set: run through `firebase emulators:exec`');
    initializeApp({ projectId: PROJECT });
    db = getFirestore();
    db.settings({ ignoreUndefinedProperties: true });
  });

  beforeEach(async () => {
    const response = await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
    assert.ok(response.ok, 'could not clear the Firestore emulator');
  });
  afterEach(async () => {
    await fake?.close();
  });
  after(async () => {
    await db.terminate();
  });

  const config = (): SpotifyAppConfig => ({ clientId: 'client', clientSecret: 'secret', accountsUrl: fake.origin, apiUrl: `${fake.origin}/v1` });

  async function start(options: FakeOptions) {
    ({ fake, expected } = await startFake(options));
  }
  async function seedUser(uid = UID, tokens: Record<string, unknown> = {}) {
    await db.doc(`users/${uid}`).set({ uid, playlistIds: [], tokens: { access: fake.issueToken(), refresh: 'fake-refresh-token', addedTime: Timestamp.now(), ...tokens } });
  }
  function importFor(uid = UID, client: Record<string, unknown> = {}) {
    const clock = fastClock(() => fake);
    return runImport({ db, uid, spotify: config(), client: { minIntervalMs: 0, maxConcurrent: 8, now: clock.now, sleep: clock.sleep, ...client } });
  }
  const userTrackIds = async (uid = UID) => (await db.collection('tracks').where('userIds', 'array-contains', uid).select().get()).docs.map((doc) => doc.id);
  const importState = async (uid = UID) => (await db.doc(`users/${uid}`).get()).get('import') as ImportState;

  /** genre -> track ids that a playlist must expose, from the fake's ground truth. */
  function expectedGenres(trackIds: string[]) {
    const genres = new Map<string, string[]>();
    for (const id of new Set(trackIds)) {
      const artistId = fake.library.tracksById.get(id)!.artists[0].id as string;
      for (const genre of fake.library.artistsById.get(artistId)!.genres) genres.set(genre, [...(genres.get(genre) ?? []), id]);
    }
    return genres;
  }
  async function assertGenres(playlistId: string, trackIds: string[]) {
    const want = expectedGenres(trackIds);
    const docs = (await db.collection(`playlists/${playlistId}/genres`).get()).docs;
    assert.deepEqual(sorted(docs.map((doc) => doc.id)), sorted(want.keys()), `genres of ${playlistId}`);
    for (const doc of docs) {
      assert.equal(doc.get('id'), doc.id);
      assert.deepEqual(sorted(doc.get('trackIds')), sorted(want.get(doc.id)!), `tracks of genre ${doc.id}`);
    }
  }

  it('writes the whole library and reports completion on the user document', async () => {
    await start({ tracks: 1500, playlists: 20, liked: 500 });
    await seedUser();
    const { stats, warnings } = await importFor();

    assert.deepEqual(warnings, []);
    assert.equal(stats.tracks, expected.uniqueTrackIds.size);
    assert.equal(stats.tracksWritten, expected.uniqueTrackIds.size);
    assert.deepEqual(sorted(await userTrackIds()), sorted(expected.uniqueTrackIds));

    const user = await db.doc(`users/${UID}`).get();
    const state = user.get('import') as ImportState;
    assert.equal(state.status, 'done');
    assert.equal(state.percent, 100);
    assert.equal(state.stats?.tracks, expected.uniqueTrackIds.size);
    assert.equal(state.found, expected.uniqueTrackIds.size);
    assert.ok(state.finishedAt instanceof Timestamp);
    assert.ok(user.get('libraryUpdatedAt') instanceof Timestamp);
    assert.deepEqual(user.get('playlistIds'), [...expected.playlists.map((playlist) => playlist.id), `${UID}LikedTracks`]);
    assert.equal(user.get('tokens.refresh'), 'fake-refresh-token', 'tokens must be left alone');

    // Every track carries its own audio features and genres.
    const tracks = await db.collection('tracks').get();
    assert.equal(tracks.size, expected.uniqueTrackIds.size);
    for (const doc of tracks.docs) {
      const truth = fake.library.tracksById.get(doc.id)!;
      const features = fake.library.features.get(doc.id);
      assert.equal(doc.get('id'), doc.id);
      assert.equal(doc.get('v'), TRACK_SCHEMA_VERSION);
      assert.deepEqual(doc.get('userIds'), [UID]);
      assert.equal(doc.get('tempo'), features?.tempo);
      assert.deepEqual(doc.get('genres'), fake.library.artistsById.get(truth.artists[0].id as string)!.genres);
      assert.equal(typeof doc.get('album.images.0.url'), 'undefined'); // arrays are not addressable by path...
      assert.match(doc.get('album').images[0].url, /^https:/); // ...but the image is there
    }

    // Playlists, including "Liked tracks", and their genre sub-collections.
    for (const playlist of expected.playlists) {
      const doc = await db.doc(`playlists/${playlist.id}`).get();
      assert.deepEqual(sorted(doc.get('trackIds')), sorted(new Set(playlist.trackIds)));
      assert.match(doc.get('name'), /^Playlist \d+$/);
    }
    const liked = await db.doc(`playlists/${UID}LikedTracks`).get();
    assert.equal(liked.get('type'), 'likedTracks');
    assert.deepEqual(sorted(liked.get('trackIds')), sorted(expected.likedIds));
    await assertGenres(expected.playlists[0].id, expected.playlists[0].trackIds);
    await assertGenres(expected.playlists[7].id, expected.playlists[7].trackIds);
    await assertGenres(`${UID}LikedTracks`, expected.likedIds);
  });

  it('on a re-import, unlinks removed tracks, drops stale genres and skips known audio features', async () => {
    await start({ tracks: 800, playlists: 10, liked: 200, edgeCases: false });
    await seedUser();
    await importFor();

    // The user empties the last playlist (its tracks are in no other playlist) and unlikes everything.
    const last = fake.library.playlists.at(-1)!;
    const removed = last.entries.map((entry) => entry.track!.id as string);
    last.entries.length = 0;
    const unliked = fake.library.liked.map((entry) => entry.track.id as string);
    fake.library.liked.length = 0;
    const stillThere = new Set(fake.library.playlists.flatMap((playlist) => playlist.entries.map((entry) => entry.track!.id as string)));
    const gone = [...new Set([...removed, ...unliked])].filter((id) => !stillThere.has(id));
    assert.ok(gone.length > 10, 'the scenario must really remove tracks');

    fake.resetStats();
    const { stats } = await importFor();

    assert.equal(stats.tracksUnlinked, gone.length);
    assert.deepEqual(sorted(await userTrackIds()), sorted(stillThere));
    for (const id of gone.slice(0, 5)) {
      const doc = await db.doc(`tracks/${id}`).get();
      assert.ok(doc.exists, 'a removed track stays in the shared catalogue');
      assert.deepEqual(doc.get('userIds'), []);
    }
    assert.deepEqual((await db.doc(`playlists/${last.id}`).get()).get('trackIds'), []);
    assert.equal((await db.collection(`playlists/${last.id}/genres`).get()).size, 0, 'genres of an emptied playlist are deleted');
    assert.equal((await db.collection(`playlists/${UID}LikedTracks/genres`).get()).size, 0);
    await assertGenres(fake.library.playlists[0].id, fake.library.playlists[0].entries.map((entry) => entry.track!.id as string));
    // Audio features were stored by the first import: only tracks without analysis are asked again.
    assert.ok((fake.stats.byRoute['GET /audio-features'] ?? 0) <= 1, `audio-features calls: ${fake.stats.byRoute['GET /audio-features']}`);
    // ...and the stored ones are still there.
    const sample = [...stillThere][0];
    assert.equal((await db.doc(`tracks/${sample}`).get()).get('tempo'), fake.library.features.get(sample)?.tempo);
  });

  it('repairs tracks stored by the previous importer (audio features matched by position)', async () => {
    await start({ tracks: 300, playlists: 4, liked: 50, edgeCases: false });
    await seedUser();
    const victim = [...expected.uniqueTrackIds].find((id) => fake.library.features.get(id))!;
    await db.doc(`tracks/${victim}`).set({ id: victim, name: 'Wrong name', tempo: 999, genres: ['not-a-genre'], userIds: [UID] });
    await importFor();
    const doc = await db.doc(`tracks/${victim}`).get();
    assert.equal(doc.get('tempo'), fake.library.features.get(victim)!.tempo);
    assert.match(doc.get('name'), /^Track \d+/);
    assert.equal(doc.get('v'), TRACK_SCHEMA_VERSION);
  });

  it('keeps the links of other users to shared tracks', async () => {
    await start({ tracks: 300, playlists: 4, liked: 50, edgeCases: false });
    await seedUser(UID);
    await seedUser('otheruser');
    await importFor(UID);
    await importFor('otheruser');
    const shared = [...expected.uniqueTrackIds][0];
    assert.deepEqual(sorted((await db.doc(`tracks/${shared}`).get()).get('userIds')), ['fakeuser', 'otheruser']);

    // Everything disappears from the library; only the user who re-imports is unlinked.
    for (const playlist of fake.library.playlists) playlist.entries.length = 0;
    fake.library.liked.length = 0;
    await importFor(UID);
    assert.deepEqual((await db.doc(`tracks/${shared}`).get()).get('userIds'), ['otheruser']);
    assert.equal((await userTrackIds('otheruser')).length, expected.uniqueTrackIds.size);
    assert.equal((await userTrackIds(UID)).length, 0);
  });

  it('refuses a second import while one is running, then accepts one again', async () => {
    await start({ tracks: 600, playlists: 8, liked: 100, latencyMs: 20 });
    await seedUser();
    const first = importFor();
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal((await importState()).status, 'running');
    await assert.rejects(importFor(), ImportAlreadyRunningError);
    await first;
    assert.equal((await importState()).status, 'done');
    await importFor();
  });

  it('takes over an import whose heartbeat stopped', async () => {
    await start({ tracks: 100, playlists: 2, liked: 20 });
    await seedUser();
    const longAgo = Timestamp.fromMillis(Date.now() - 5 * 60 * 1000);
    await db.doc(`users/${UID}`).update({ import: { status: 'running', runId: 'dead', phase: 'tracks', percent: 30, done: 1, total: 3, startedAt: longAgo, updatedAt: longAgo } });
    await importFor();
    const state = await importState();
    assert.equal(state.status, 'done');
    assert.notEqual(state.runId, 'dead');
  });

  it('publishes progress while running', async () => {
    await start({ tracks: 1500, playlists: 20, liked: 300, latencyMs: 25 });
    await seedUser();
    const seen: ImportState[] = [];
    const unsubscribe = db.doc(`users/${UID}`).onSnapshot((snapshot) => {
      const state = snapshot.get('import') as ImportState | undefined;
      if (state) seen.push(state);
    });
    await importFor(UID, { maxConcurrent: 3 });
    await new Promise((resolve) => setTimeout(resolve, 300));
    unsubscribe();
    const running = seen.filter((state) => state.status === 'running');
    assert.ok(running.length >= 2, `only ${running.length} progress updates`);
    const percents = seen.map((state) => state.percent);
    assert.deepEqual(percents, [...percents].sort((a, b) => a - b), 'progress never goes backwards');
    assert.equal(seen.at(-1)!.status, 'done');
    assert.ok(running.some((state) => state.phase === 'tracks' && state.total > 0));
  });

  it('refreshes the Spotify token when it expires in the middle of the import', async () => {
    await start({ tracks: 2000, playlists: 20, liked: 300, latencyMs: 30, tokenTtlS: 1 });
    await seedUser();
    const before = (await db.doc(`users/${UID}`).get()).get('tokens.access');
    await importFor(UID, { maxConcurrent: 2 });
    assert.ok(fake.stats.tokenRequests >= 1, 'the token should have been refreshed');
    assert.deepEqual(sorted(await userTrackIds()), sorted(expected.uniqueTrackIds));
    const tokens = (await db.doc(`users/${UID}`).get()).get('tokens');
    assert.notEqual(tokens.access, before);
    assert.equal(tokens.refresh, 'fake-refresh-token');
    assert.ok(tokens.addedTime instanceof Timestamp);
  });

  it('asks for a new Spotify login when the refresh token is revoked', async () => {
    await start({ tracks: 100, playlists: 2, liked: 20 });
    await seedUser(UID, { access: 'expired', refresh: 'revoked', addedTime: Timestamp.fromMillis(Date.now() - 2 * 3600 * 1000) });
    await assert.rejects(importFor(), (error: unknown) => error instanceof ImportError && error.failure.code === 'spotify-reauth');
    const state = await importState();
    assert.equal(state.status, 'error');
    assert.equal(state.error?.code, 'spotify-reauth');
  });

  it('leaves the stored library untouched when Spotify fails half-way', async () => {
    await start({ tracks: 600, playlists: 8, liked: 100, edgeCases: false });
    await seedUser();
    await importFor();
    const before = sorted(await userTrackIds());
    const playlistIdsBefore = (await db.doc(`users/${UID}`).get()).get('playlistIds');

    // Spotify answers the playlist list, then only errors.
    fake.resetStats();
    const timer = setInterval(() => {
      if (fake.stats.accepted >= 3) fake.options.errorRate = 1;
    }, 1);
    await assert.rejects(importFor(UID, { maxRetries: 2, maxConcurrent: 1 }), (error: unknown) => error instanceof ImportError && error.failure.code === 'spotify-unavailable');
    clearInterval(timer);

    assert.deepEqual(sorted(await userTrackIds()), before, 'no track may be unlinked by a failed import');
    const user = await db.doc(`users/${UID}`).get();
    assert.deepEqual(user.get('playlistIds'), playlistIdsBefore);
    assert.equal(user.get('import.status'), 'error');
    assert.equal(user.get('import.error.code'), 'spotify-unavailable');
    // ...and the next attempt works.
    fake.options.errorRate = 0;
    await importFor();
    assert.equal((await importState()).status, 'done');
  });

  it('creates the Firebase account and the user document at login', async () => {
    await start({ tracks: 100, playlists: 2, liked: 20 });
    const auth = getAuth();
    await auth.deleteUser(UID).catch(() => undefined);

    const tokens = await exchangeAuthorizationCode(config(), 'fake-code-1', 'http://127.0.0.1:4200/login');
    const profile = await fetchProfile(config(), tokens.access_token);
    await upsertUser(db, auth, profile, tokens);

    const record = await auth.getUser(UID);
    assert.equal(record.email, 'fake.user@example.test');
    assert.equal(record.displayName, 'Fake User');
    const user = await db.doc(`users/${UID}`).get();
    assert.deepEqual(user.get('playlistIds'), []);
    assert.equal(user.get('tokens.access'), tokens.access_token);
    assert.equal(user.get('tokens.refresh'), 'fake-refresh-token');
    assert.ok((await auth.createCustomToken(UID)).length > 20);

    // A later login keeps the library references.
    await user.ref.update({ playlistIds: ['a', 'b'] });
    await upsertUser(db, auth, profile, await exchangeAuthorizationCode(config(), 'fake-code-2', 'http://127.0.0.1:4200/login'));
    assert.deepEqual((await user.ref.get()).get('playlistIds'), ['a', 'b']);
  });
});
