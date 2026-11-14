/**
 * Rate-limit aware client for the Spotify Web API.
 *
 * Importing a large library means ~1 request per 50-100 tracks, so thousands of
 * requests. Spotify rate limits on a rolling 30 s window and answers 429 with a
 * `Retry-After` header (in seconds). This client keeps the whole import well
 * behaved:
 *  - bounded concurrency and a minimum spacing between requests;
 *  - on a 429 every pending request waits for `Retry-After` (not only the one
 *    that was rejected) and the pace is halved, then slowly restored;
 *  - 5xx and network errors are retried with exponential backoff;
 *  - an expired access token is refreshed once, then the request is replayed.
 *
 * A request either returns its payload or throws: a page is never silently
 * dropped, because a missing page would later look like "tracks removed".
 */

export class SpotifyHttpError extends Error {
  constructor(readonly status: number, readonly url: string, readonly body: string) {
    super(`Spotify answered ${status} for ${stripQuery(url)}: ${body.slice(0, 200)}`);
    this.name = 'SpotifyHttpError';
  }
}

/** Spotify asked to wait longer than we are willing to (or kept answering 429). */
export class SpotifyRateLimitError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super(`Spotify rate limit: retry after ${retryAfterSeconds}s`);
    this.name = 'SpotifyRateLimitError';
  }
}

/** The access token is rejected even after a refresh. */
export class SpotifyAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SpotifyAuthError';
  }
}

/** Spotify could not be reached, or kept failing, after all retries. */
export class SpotifyUnavailableError extends Error {
  constructor(readonly url: string, readonly lastError: string) {
    super(`Spotify unavailable for ${stripQuery(url)}: ${lastError}`);
    this.name = 'SpotifyUnavailableError';
  }
}

export interface SpotifyClientOptions {
  /** e.g. https://api.spotify.com/v1 */
  apiUrl: string;
  /**
   * Returns a valid access token. When `staleToken` is given, that token was
   * just rejected with a 401 and a new one must be returned.
   */
  getAccessToken: (staleToken?: string) => Promise<string>;
  /** Requests running at the same time. */
  maxConcurrent?: number;
  /** Minimum delay between two request starts (100 ms = at most 10 requests/s). */
  minIntervalMs?: number;
  /** Retries for 5xx / network failures, per request. */
  maxRetries?: number;
  /** Give up when Spotify asks to wait longer than this. */
  maxRateLimitWaitSeconds?: number;
  /** Give up after this many 429 answers for the same request. */
  maxRateLimitHits?: number;
  /**
   * Spotify is considered down when nothing but failures (5xx, network) came
   * back for this long: every pending request then fails at once instead of
   * going through its own retries. Shorter blips are absorbed by the retries.
   */
  maxOutageMs?: number;
  requestTimeoutMs?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  log?: (message: string) => void;
}

export interface SpotifyClientStats {
  requests: number;
  rateLimited: number;
  retries: number;
  tokenRefreshes: number;
}

type Query = Record<string, string | number | undefined>;

const stripQuery = (url: string) => url.split('?')[0];
const MAX_INTERVAL_MS = 1000;
const MIN_FAILURES_FOR_OUTAGE = 10;
const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class SpotifyClient {
  readonly stats: SpotifyClientStats = { requests: 0, rateLimited: 0, retries: 0, tokenRefreshes: 0 };

  private readonly apiUrl: string;
  private readonly getAccessToken: (staleToken?: string) => Promise<string>;
  private readonly maxConcurrent: number;
  private readonly baseIntervalMs: number;
  private readonly maxRetries: number;
  private readonly maxRateLimitWaitSeconds: number;
  private readonly maxRateLimitHits: number;
  private readonly maxOutageMs: number;
  private readonly requestTimeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly log: (message: string) => void;

  private active = 0;
  private readonly waiters: Array<() => void> = [];
  /** Earliest time at which the next request may start. */
  private nextSlot = 0;
  /** Nothing starts before this time (set by a 429). */
  private pausedUntil = 0;
  private intervalMs: number;
  /** Fastest pace allowed; raised each time Spotify rate limits us. */
  private floorIntervalMs: number;
  private successStreak = 0;
  private consecutiveFailures = 0;
  /** When the current series of failures started. */
  private failingSince = 0;
  /** Set once Spotify is considered down: why. */
  private down?: string;
  private closed = false;

  constructor(options: SpotifyClientOptions) {
    this.apiUrl = options.apiUrl.replace(/\/$/, '');
    this.getAccessToken = options.getAccessToken;
    this.maxConcurrent = options.maxConcurrent ?? 6;
    this.baseIntervalMs = options.minIntervalMs ?? 100;
    this.maxRetries = options.maxRetries ?? 5;
    this.maxRateLimitWaitSeconds = options.maxRateLimitWaitSeconds ?? 120;
    this.maxRateLimitHits = options.maxRateLimitHits ?? 8;
    this.maxOutageMs = options.maxOutageMs ?? 20_000;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 20_000;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleep = options.sleep ?? defaultSleep;
    this.now = options.now ?? Date.now;
    this.log = options.log ?? (() => undefined);
    this.intervalMs = this.baseIntervalMs;
    this.floorIntervalMs = this.baseIntervalMs;
  }

  /** Makes every request that has not started yet fail instead of calling Spotify. */
  close(): void {
    this.closed = true;
  }

  /** GET a path (relative to the API url) or an absolute url. */
  get<T>(pathOrUrl: string, query?: Query): Promise<T> {
    return this.request<T>(this.buildUrl(pathOrUrl, query));
  }

  private buildUrl(pathOrUrl: string, query?: Query): string {
    const url = new URL(/^https?:\/\//.test(pathOrUrl) ? pathOrUrl : `${this.apiUrl}${pathOrUrl}`);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    return url.href;
  }

  private async request<T>(url: string): Promise<T> {
    let transientFailures = 0;
    let rateLimitHits = 0;
    let refreshedToken = false;

    for (;;) {
      const attempt = await this.attempt(url);

      if (attempt.kind === 'ok') {
        this.onSuccess();
        return attempt.data as T;
      }

      if (attempt.kind === 'rate-limited') {
        rateLimitHits++;
        this.stats.rateLimited++;
        const waitSeconds = attempt.retryAfterSeconds ?? Math.min(2 ** rateLimitHits, 60);
        if (waitSeconds > this.maxRateLimitWaitSeconds || rateLimitHits > this.maxRateLimitHits) {
          throw new SpotifyRateLimitError(waitSeconds);
        }
        this.pauseEverything(waitSeconds);
        continue;
      }

      if (attempt.kind === 'unauthorized') {
        if (refreshedToken) throw new SpotifyAuthError(`Spotify rejected the access token: ${attempt.body.slice(0, 200)}`);
        refreshedToken = true;
        this.stats.tokenRefreshes++;
        await this.getAccessToken(attempt.token);
        continue;
      }

      if (attempt.kind === 'transient') {
        transientFailures++;
        if (this.consecutiveFailures++ === 0) this.failingSince = this.now();
        const outageMs = this.now() - this.failingSince;
        if (this.consecutiveFailures >= MIN_FAILURES_FOR_OUTAGE && outageMs >= this.maxOutageMs) {
          this.down ??= `only failures for ${Math.round(outageMs / 1000)}s (${this.consecutiveFailures} requests), last: ${attempt.reason}`;
        }
        if (this.down) throw new SpotifyUnavailableError(url, this.down);
        if (transientFailures > this.maxRetries) throw new SpotifyUnavailableError(url, attempt.reason);
        this.stats.retries++;
        const backoff = Math.min(8000, 500 * 2 ** (transientFailures - 1));
        await this.sleep(backoff + Math.random() * 250);
        continue;
      }

      throw new SpotifyHttpError(attempt.status, url, attempt.body);
    }
  }

  /** One HTTP round trip, inside a concurrency slot and after pacing. */
  private async attempt(
    url: string
  ): Promise<
    | { kind: 'ok'; data: unknown }
    | { kind: 'rate-limited'; retryAfterSeconds?: number }
    | { kind: 'unauthorized'; token: string; body: string }
    | { kind: 'transient'; reason: string }
    | { kind: 'error'; status: number; body: string }
  > {
    await this.acquire();
    try {
      await this.pace();
      if (this.closed) throw new SpotifyUnavailableError(url, 'client closed');
      if (this.down) throw new SpotifyUnavailableError(url, this.down);
      const token = await this.getAccessToken();
      this.stats.requests++;
      let response: Response;
      let body: string;
      try {
        response = await this.fetchImpl(url, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
          signal: AbortSignal.timeout(this.requestTimeoutMs),
        });
        body = await response.text();
      } catch (error) {
        return { kind: 'transient', reason: error instanceof Error ? `${error.name}: ${error.message}` : String(error) };
      }

      if (response.ok) {
        if (!body) return { kind: 'ok', data: undefined };
        try {
          return { kind: 'ok', data: JSON.parse(body) };
        } catch {
          return { kind: 'transient', reason: `invalid JSON in a ${response.status} response` };
        }
      }
      if (response.status === 429) {
        const header = Number(response.headers.get('retry-after'));
        return { kind: 'rate-limited', retryAfterSeconds: Number.isFinite(header) && header > 0 ? header : undefined };
      }
      if (response.status === 401) return { kind: 'unauthorized', token, body };
      if (response.status >= 500) return { kind: 'transient', reason: `HTTP ${response.status}` };
      return { kind: 'error', status: response.status, body };
    } finally {
      this.release();
    }
  }

  private async acquire(): Promise<void> {
    while (this.active >= this.maxConcurrent) {
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
    this.active++;
  }

  private release(): void {
    this.active--;
    this.waiters.shift()?.();
  }

  /** Waits for this request's start slot; slots are spaced by `intervalMs`. */
  private async pace(): Promise<void> {
    for (;;) {
      const now = this.now();
      const start = Math.max(this.nextSlot, this.pausedUntil, now);
      this.nextSlot = start + this.intervalMs;
      if (start <= now) return;
      await this.sleep(start - now);
      // A 429 may have paused everything while we were waiting: take a new slot.
      if (this.pausedUntil <= this.now()) return;
    }
  }

  private pauseEverything(seconds: number): void {
    const now = this.now();
    // Requests already in flight usually get a 429 too: only the first one of a burst slows the pace down.
    if (this.pausedUntil <= now) {
      // Never go back to the pace that just got us limited.
      this.floorIntervalMs = Math.min(MAX_INTERVAL_MS, Math.ceil(this.intervalMs * 1.25));
      this.intervalMs = Math.min(MAX_INTERVAL_MS, this.intervalMs * 2);
      this.successStreak = 0;
      this.log(`Spotify rate limit hit: pausing all requests for ${seconds}s, then 1 request every ${this.intervalMs} ms`);
    }
    this.pausedUntil = Math.max(this.pausedUntil, now + seconds * 1000 + Math.random() * 250);
  }

  private onSuccess(): void {
    this.consecutiveFailures = 0;
    if (this.intervalMs <= this.floorIntervalMs) return;
    if (++this.successStreak >= 40) {
      this.successStreak = 0;
      this.intervalMs = Math.max(this.floorIntervalMs, Math.floor(this.intervalMs * 0.75));
    }
  }
}
