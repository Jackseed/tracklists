import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { SpotifyAuthError, SpotifyClient, SpotifyHttpError, SpotifyRateLimitError, SpotifyUnavailableError } from '../../src/spotify/client';
import { fastClock, FakeSpotify, startFake } from '../helpers';

describe('SpotifyClient', () => {
  let fake: FakeSpotify | undefined;
  afterEach(async () => {
    await fake?.close();
    fake = undefined;
  });

  const clientFor = (server: FakeSpotify, overrides: Partial<ConstructorParameters<typeof SpotifyClient>[0]> = {}) => {
    let token = server.issueToken();
    const refreshed: string[] = [];
    const client = new SpotifyClient({
      apiUrl: `${server.origin}/v1`,
      getAccessToken: async (stale) => {
        if (stale !== undefined && stale === token) {
          token = server.issueToken();
          refreshed.push(token);
        }
        return token;
      },
      minIntervalMs: 0,
      ...overrides,
    });
    return { client, refreshed };
  };

  it('returns the JSON payload', async () => {
    ({ fake } = await startFake({ tracks: 60, playlists: 3, liked: 10 }));
    const { client } = clientFor(fake);
    const page = await client.get<{ total: number; items: unknown[] }>('/me/playlists', { limit: 2 });
    assert.equal(page.total, 3);
    assert.equal(page.items.length, 2);
  });

  it('never exceeds the configured concurrency', async () => {
    ({ fake } = await startFake({ tracks: 400, playlists: 3, liked: 400, latencyMs: 15 }));
    const { client } = clientFor(fake, { maxConcurrent: 3 });
    await Promise.all(Array.from({ length: 40 }, (_, i) => client.get('/me/tracks', { limit: 10, offset: i * 10 })));
    assert.ok(fake.stats.maxInFlight <= 3, `max in flight: ${fake.stats.maxInFlight}`);
    assert.equal(fake.stats.accepted, 40);
  });

  it('spaces requests by the minimum interval', async () => {
    ({ fake } = await startFake({ tracks: 60, playlists: 3, liked: 10 }));
    const { client } = clientFor(fake, { minIntervalMs: 40, maxConcurrent: 10 });
    const start = Date.now();
    await Promise.all(Array.from({ length: 10 }, () => client.get('/me')));
    const elapsed = Date.now() - start;
    assert.ok(elapsed >= 9 * 40 - 20, `10 requests took ${elapsed} ms, expected at least ~360 ms`);
  });

  it('waits for Retry-After on a 429, without hammering, and completes every request', async () => {
    ({ fake } = await startFake({ tracks: 60, playlists: 3, liked: 10, rateLimit: 25 }));
    const clock = fastClock(() => fake);
    const { client } = clientFor(fake, { maxConcurrent: 5, now: clock.now, sleep: clock.sleep });
    const results = await Promise.all(Array.from({ length: 60 }, () => client.get<{ id: string }>('/me')));
    assert.equal(results.length, 60);
    assert.ok(results.every((profile) => profile.id === 'fakeuser'));
    assert.ok(client.stats.rateLimited >= 1, 'the rate limit should have been hit');
    // Only requests already in flight may be rejected: at most `maxConcurrent` per pause.
    assert.ok(client.stats.rateLimited <= 5 * 3, `too many 429s: ${client.stats.rateLimited}`);
    assert.ok(clock.sleeps.some((ms) => ms >= 1000), 'the client should have slept for Retry-After');
    assert.equal(fake.stats.accepted, 60, 'each request must be served exactly once');
  });

  it('gives up when Spotify asks to wait too long', async () => {
    ({ fake } = await startFake({ tracks: 60, playlists: 3, liked: 10, rateLimit: 1 }));
    const { client } = clientFor(fake, { maxRateLimitWaitSeconds: 5 });
    await client.get('/me');
    await assert.rejects(client.get('/me'), (error: unknown) => error instanceof SpotifyRateLimitError && error.retryAfterSeconds > 5);
  });

  it('retries server errors', async () => {
    ({ fake } = await startFake({ tracks: 60, playlists: 3, liked: 10, errorRate: 0.4 }));
    const { client } = clientFor(fake, { sleep: async () => undefined, maxRetries: 12 });
    const results = await Promise.all(Array.from({ length: 30 }, () => client.get<{ id: string }>('/me')));
    assert.ok(results.every((profile) => profile.id === 'fakeuser'));
    assert.ok(client.stats.retries > 0);
  });

  it('fails with SpotifyUnavailableError when the server keeps failing', async () => {
    ({ fake } = await startFake({ tracks: 60, playlists: 3, liked: 10, errorRate: 1 }));
    const { client } = clientFor(fake, { sleep: async () => undefined, maxRetries: 2 });
    await assert.rejects(client.get('/me'), SpotifyUnavailableError);
    assert.equal(fake.stats.accepted, 3); // first try + 2 retries
  });

  it('declares Spotify down when only failures come back for too long', async () => {
    ({ fake } = await startFake({ tracks: 60, playlists: 3, liked: 10, errorRate: 1 }));
    const clock = fastClock(() => fake);
    const { client } = clientFor(fake, { now: clock.now, sleep: clock.sleep, maxRetries: 50, maxOutageMs: 20_000, maxConcurrent: 4 });
    const results = await Promise.allSettled(Array.from({ length: 200 }, () => client.get('/me')));
    assert.ok(results.every((result) => result.status === 'rejected' && result.reason instanceof SpotifyUnavailableError));
    // 200 requests x 51 attempts would be 10 200 calls: the circuit opens after ~20 s of (virtual) outage.
    assert.ok(fake.stats.accepted < 150, `calls made: ${fake.stats.accepted}`);
    assert.match(String((results[0] as PromiseRejectedResult).reason.message), /only failures for \d+s/);
  });

  it('rides out a short outage', async () => {
    ({ fake } = await startFake({ tracks: 60, playlists: 3, liked: 10, errorRate: 1 }));
    const clock = fastClock(() => fake);
    const { client } = clientFor(fake, {
      now: clock.now,
      maxOutageMs: 20_000,
      maxConcurrent: 4,
      // Spotify comes back after ~6 s of (virtual) time.
      sleep: async (ms) => {
        await clock.sleep(ms);
        if (clock.now() - started > 6000) fake!.options.errorRate = 0;
      },
    });
    const started = clock.now();
    const results = await Promise.all(Array.from({ length: 40 }, () => client.get<{ id: string }>('/me')));
    assert.ok(results.every((profile) => profile.id === 'fakeuser'));
    assert.ok(client.stats.retries > 0);
  });

  it('does not give up on scattered failures', async () => {
    ({ fake } = await startFake({ tracks: 60, playlists: 3, liked: 10, errorRate: 0.3 }));
    const clock = fastClock(() => fake);
    const { client } = clientFor(fake, { now: clock.now, sleep: clock.sleep, maxRetries: 30, maxOutageMs: 20_000, maxConcurrent: 4 });
    const results = await Promise.all(Array.from({ length: 150 }, () => client.get<{ id: string }>('/me')));
    assert.ok(results.every((profile) => profile.id === 'fakeuser'));
  });

  it('refreshes an expired token once and replays the request', async () => {
    ({ fake } = await startFake({ tracks: 60, playlists: 3, liked: 10, tokenTtlS: 1 }));
    const { client, refreshed } = clientFor(fake);
    await client.get('/me');
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const results = await Promise.all(Array.from({ length: 5 }, () => client.get<{ id: string }>('/me')));
    assert.ok(results.every((profile) => profile.id === 'fakeuser'));
    assert.equal(refreshed.length, 1, 'concurrent 401s must share a single refresh');
  });

  it('fails with SpotifyAuthError when the refreshed token is rejected too', async () => {
    ({ fake } = await startFake({ tracks: 60, playlists: 3, liked: 10 }));
    const client = new SpotifyClient({ apiUrl: `${fake.origin}/v1`, getAccessToken: async () => 'not-a-token', minIntervalMs: 0 });
    await assert.rejects(client.get('/me'), SpotifyAuthError);
  });

  it('does not retry client errors', async () => {
    ({ fake } = await startFake({ tracks: 60, playlists: 3, liked: 10 }));
    const { client } = clientFor(fake);
    await assert.rejects(client.get('/artists?ids=,'), (error: unknown) => error instanceof SpotifyHttpError && error.status === 400);
    assert.equal(fake.stats.api, 1);
  });

  it('stops calling Spotify once closed', async () => {
    ({ fake } = await startFake({ tracks: 60, playlists: 3, liked: 10 }));
    const { client } = clientFor(fake);
    client.close();
    await assert.rejects(client.get('/me'), SpotifyUnavailableError);
    assert.equal(fake.stats.api, 0);
  });
});
