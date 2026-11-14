import { defineInt, defineSecret, defineString } from 'firebase-functions/params';
import { SpotifyAppConfig } from './spotify/accounts';

/**
 * Deploy-time configuration. Values live in `functions/.env.<projectId>` (see
 * `.env.example`); the client secret lives in Secret Manager:
 *   firebase functions:secrets:set SPOTIFY_CLIENT_SECRET
 * For the emulators, use `.env.local` and `.secret.local`.
 */
export const SPOTIFY_CLIENT_ID = defineString('SPOTIFY_CLIENT_ID', { description: 'Client ID of the Spotify app' });
export const SPOTIFY_CLIENT_SECRET = defineSecret('SPOTIFY_CLIENT_SECRET');

/** Used when the web client does not send its own redirect URI. */
export const SPOTIFY_REDIRECT_URI = defineString('SPOTIFY_REDIRECT_URI', { default: '', description: 'Default OAuth redirect URI, e.g. https://tracklists.io/login' });

/** Overridden only to point at the fake Spotify server (tools/fake-spotify). */
export const SPOTIFY_API_URL = defineString('SPOTIFY_API_URL', { default: 'https://api.spotify.com/v1' });
export const SPOTIFY_ACCOUNTS_URL = defineString('SPOTIFY_ACCOUNTS_URL', { default: 'https://accounts.spotify.com' });

/** Pace of the library import. Spotify's limit is not public: the import slows down by itself on a 429. */
export const SPOTIFY_MAX_REQUESTS_PER_SECOND = defineInt('SPOTIFY_MAX_REQUESTS_PER_SECOND', { default: 10 });
export const SPOTIFY_MAX_CONCURRENT_REQUESTS = defineInt('SPOTIFY_MAX_CONCURRENT_REQUESTS', { default: 6 });

/**
 * Service account that signs the Firebase custom tokens, e.g.
 * firebase-adminsdk-xxxxx@<project>.iam.gserviceaccount.com (formerly
 * `functions.serviceaccountid` in the runtime config). Empty: the service
 * account running the function signs, and needs the "Service Account Token
 * Creator" role on itself.
 */
export const CUSTOM_TOKEN_SERVICE_ACCOUNT = defineString('CUSTOM_TOKEN_SERVICE_ACCOUNT', { default: '' });

export function spotifyConfig(): SpotifyAppConfig {
  return {
    clientId: SPOTIFY_CLIENT_ID.value(),
    clientSecret: SPOTIFY_CLIENT_SECRET.value(),
    accountsUrl: SPOTIFY_ACCOUNTS_URL.value(),
    apiUrl: SPOTIFY_API_URL.value(),
  };
}
