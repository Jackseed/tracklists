/**
 * Spotify Accounts service: authorization-code exchange and token refresh.
 */

export interface SpotifyAppConfig {
  clientId: string;
  clientSecret: string;
  /** e.g. https://accounts.spotify.com */
  accountsUrl: string;
  /** e.g. https://api.spotify.com/v1 */
  apiUrl: string;
}

export interface SpotifyTokenResponse {
  access_token: string;
  expires_in: number;
  /** Only returned by the code exchange, and by a refresh when Spotify rotates it. */
  refresh_token?: string;
}

/** The grant (authorization code or refresh token) is invalid, expired or revoked. */
export class SpotifyGrantError extends Error {
  constructor(readonly reason: string, description: string) {
    super(`Spotify refused the grant (${reason}): ${description}`);
    this.name = 'SpotifyGrantError';
  }
}

export class SpotifyAccountsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SpotifyAccountsError';
  }
}

async function requestToken(config: SpotifyAppConfig, params: Record<string, string>): Promise<SpotifyTokenResponse> {
  const basic = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');
  let lastError = '';
  for (let attempt = 1; attempt <= 3; attempt++) {
    let response: Response;
    let body: string;
    try {
      response = await fetch(`${config.accountsUrl.replace(/\/$/, '')}/api/token`, {
        method: 'POST',
        headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(params).toString(),
        signal: AbortSignal.timeout(15_000),
      });
      body = await response.text();
    } catch (error) {
      lastError = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
      continue;
    }

    if (response.ok) {
      const json = JSON.parse(body) as SpotifyTokenResponse;
      if (!json.access_token) throw new SpotifyAccountsError('Spotify token response has no access_token');
      return json;
    }
    if (response.status >= 500 || response.status === 429) {
      lastError = `HTTP ${response.status}`;
      await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
      continue;
    }

    let reason = `http_${response.status}`;
    let description = body.slice(0, 200);
    try {
      const json = JSON.parse(body) as { error?: string; error_description?: string };
      reason = json.error ?? reason;
      description = json.error_description ?? description;
    } catch {
      // Non-JSON error body: keep the raw text.
    }
    if (reason === 'invalid_grant') throw new SpotifyGrantError(reason, description);
    // invalid_client, invalid_request...: a configuration problem on our side.
    throw new SpotifyAccountsError(`Spotify token endpoint answered ${response.status} (${reason}): ${description}`);
  }
  throw new SpotifyAccountsError(`Spotify token endpoint unreachable: ${lastError}`);
}

export function exchangeAuthorizationCode(config: SpotifyAppConfig, code: string, redirectUri: string): Promise<SpotifyTokenResponse> {
  return requestToken(config, { grant_type: 'authorization_code', code, redirect_uri: redirectUri });
}

export function refreshAccessToken(config: SpotifyAppConfig, refreshToken: string): Promise<SpotifyTokenResponse> {
  return requestToken(config, { grant_type: 'refresh_token', refresh_token: refreshToken });
}

export interface SpotifyProfile {
  id: string;
  display_name?: string | null;
  /** Not returned any more to apps in Spotify's "development mode". */
  email?: string | null;
}

export async function fetchProfile(config: SpotifyAppConfig, accessToken: string): Promise<SpotifyProfile> {
  const response = await fetch(`${config.apiUrl.replace(/\/$/, '')}/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(15_000),
  });
  const body = await response.text();
  if (!response.ok) throw new SpotifyAccountsError(`Spotify profile request answered ${response.status}: ${body.slice(0, 200)}`);
  const profile = JSON.parse(body) as SpotifyProfile;
  if (!profile.id) throw new SpotifyAccountsError('Spotify profile has no id');
  return profile;
}
