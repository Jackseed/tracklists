import { FieldValue, Firestore, Timestamp } from 'firebase-admin/firestore';
import { refreshAccessToken, SpotifyAppConfig, SpotifyGrantError } from './spotify/accounts';

/** The user has to go through the Spotify login again (no usable refresh token). */
export class ReauthRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReauthRequiredError';
  }
}

/** Spotify access tokens live one hour; refresh a bit earlier. */
const MAX_TOKEN_AGE_MS = 50 * 60 * 1000;

/**
 * Spotify tokens of one user, stored in `users/{uid}.tokens`.
 *
 * Tokens are read and refreshed on the server only: callers never have to send
 * them, and a long import keeps working when the access token expires half-way.
 */
export class UserTokens {
  private current?: { access: string; obtainedAt: number };
  private refreshToken?: string;
  private loaded = false;
  private refreshing?: Promise<string>;

  constructor(
    private readonly db: Firestore,
    private readonly uid: string,
    private readonly config: SpotifyAppConfig,
    private readonly now: () => number = Date.now
  ) {}

  /**
   * Returns a valid access token. Pass `staleToken` when Spotify just rejected
   * it: a refresh is then forced, unless another caller already replaced it.
   */
  async get(staleToken?: string): Promise<string> {
    if (!this.loaded) await this.load();
    const current = this.current;
    const usable = current && current.access !== staleToken && this.now() - current.obtainedAt < MAX_TOKEN_AGE_MS;
    if (usable) return current.access;
    // Single flight: concurrent callers share the same refresh.
    this.refreshing ??= this.refresh().finally(() => (this.refreshing = undefined));
    return this.refreshing;
  }

  private async load(): Promise<void> {
    const snapshot = await this.db.doc(`users/${this.uid}`).get();
    const tokens = snapshot.get('tokens') as { access?: string; refresh?: string; addedTime?: Timestamp } | undefined;
    this.refreshToken = tokens?.refresh || undefined;
    if (tokens?.access && tokens.addedTime instanceof Timestamp) {
      this.current = { access: tokens.access, obtainedAt: tokens.addedTime.toMillis() };
    }
    this.loaded = true;
  }

  private async refresh(): Promise<string> {
    if (!this.refreshToken) throw new ReauthRequiredError('No Spotify refresh token stored for this user');
    let response;
    try {
      response = await refreshAccessToken(this.config, this.refreshToken);
    } catch (error) {
      if (error instanceof SpotifyGrantError) throw new ReauthRequiredError(error.message);
      throw error;
    }
    this.current = { access: response.access_token, obtainedAt: this.now() };
    if (response.refresh_token) this.refreshToken = response.refresh_token;
    await saveTokens(this.db, this.uid, response.access_token, response.refresh_token);
    return response.access_token;
  }
}

/** Stores the tokens the way the web client expects them (`tokens.access` + `tokens.addedTime`). */
export async function saveTokens(db: Firestore, uid: string, accessToken: string, refreshToken?: string): Promise<void> {
  const tokens: Record<string, unknown> = { access: accessToken, addedTime: FieldValue.serverTimestamp() };
  if (refreshToken) tokens.refresh = refreshToken;
  await db.doc(`users/${uid}`).set({ tokens }, { merge: true });
}
