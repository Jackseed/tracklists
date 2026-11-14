/**
 * Imports a large fake library with real waits (rate limiting included) and
 * prints how long it takes. Run through the emulators, from the repository root:
 *   npx firebase emulators:exec --project demo-tracklists --only firestore "npm --prefix functions run bench"
 * Sizes: BENCH_TRACKS, BENCH_PLAYLISTS, BENCH_LIKED, BENCH_RATE_LIMIT (requests / 30 s), BENCH_LATENCY_MS.
 */
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { ImportState, runImport } from '../../src/library/import';
import { startFake } from '../helpers';

const env = (name: string, fallback: number) => Number(process.env[name] ?? fallback);

async function main() {
  const options = {
    tracks: env('BENCH_TRACKS', 20000),
    playlists: env('BENCH_PLAYLISTS', 300),
    liked: env('BENCH_LIKED', 5000),
    rateLimit: env('BENCH_RATE_LIMIT', 0),
    latencyMs: env('BENCH_LATENCY_MS', 60),
    errorRate: env('BENCH_ERROR_RATE', 0),
  };
  const { fake, expected } = await startFake(options);
  initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? 'demo-tracklists' });
  const db = getFirestore();
  db.settings({ ignoreUndefinedProperties: true });
  const uid = `bench-${Date.now()}`;
  fake.library.user.id = uid;
  await db.doc(`users/${uid}`).set({ uid, playlistIds: [], tokens: { access: fake.issueToken(), refresh: 'fake-refresh-token', addedTime: Timestamp.now() } });

  const phases: Record<string, number> = {};
  const started = Date.now();
  const unsubscribe = db.doc(`users/${uid}`).onSnapshot((snapshot) => {
    const state = snapshot.get('import') as ImportState | undefined;
    if (state && phases[state.phase] === undefined) phases[state.phase] = Math.round((Date.now() - started) / 100) / 10;
  });

  const run = async (label: string) => {
    fake.resetStats();
    const t0 = Date.now();
    const { stats, warnings } = await runImport({
      db,
      uid,
      spotify: { clientId: 'client', clientSecret: 'secret', accountsUrl: fake.origin, apiUrl: `${fake.origin}/v1` },
      client: { maxConcurrent: env('BENCH_CONCURRENCY', 6), minIntervalMs: Math.ceil(1000 / env('BENCH_RPS', 10)) },
    });
    const linked = (await db.collection('tracks').where('userIds', 'array-contains', uid).select().get()).size;
    console.log(
      JSON.stringify(
        {
          label,
          library: { playlists: options.playlists, uniqueTracks: expected.uniqueTrackIds.size, liked: fake.library.liked.length },
          simulated: { rateLimitPer30s: options.rateLimit || 'off', latencyMs: options.latencyMs, errorRate: options.errorRate },
          seconds: Math.round((Date.now() - t0) / 100) / 10,
          tracksLinkedInFirestore: linked,
          complete: linked === expected.uniqueTrackIds.size,
          spotifyCalls: fake.stats.api,
          http429: fake.stats.rateLimited,
          maxParallelCalls: fake.stats.maxInFlight,
          warnings,
          tracksWritten: stats.tracksWritten,
          genreDocsWritten: stats.genreDocsWritten,
          audioFeaturesFetched: stats.audioFeaturesFetched,
        },
        null,
        1
      )
    );
  };

  await run('first import');
  console.log('phase start times (s):', JSON.stringify(phases));
  if (process.env.BENCH_REIMPORT !== '0') await run('re-import (nothing changed)');
  unsubscribe();
  await fake.close();
  await db.terminate();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
