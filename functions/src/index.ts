import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';
import { setGlobalOptions } from 'firebase-functions/v2';
import { CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https';
import {
  CUSTOM_TOKEN_SERVICE_ACCOUNT,
  SPOTIFY_CLIENT_SECRET,
  SPOTIFY_MAX_CONCURRENT_REQUESTS,
  SPOTIFY_MAX_REQUESTS_PER_SECOND,
  SPOTIFY_REDIRECT_URI,
  spotifyConfig,
} from './config';
import { ImportAlreadyRunningError, ImportError, runImport } from './library/import';
import { exchangeAuthorizationCode, fetchProfile, SpotifyGrantError } from './spotify/accounts';
import { ReauthRequiredError, UserTokens } from './tokens';
import { upsertUser } from './users';

// The former 1st-gen functions ran as the App Engine default service account.
// Keeping the same identity means the IAM grants already in place (signing
// custom tokens, Firestore access) keep working. Override with
// FUNCTIONS_SERVICE_ACCOUNT in functions/.env.<projectId> if needed.
const projectId = process.env.GCLOUD_PROJECT;
const serviceAccount = process.env.FUNCTIONS_SERVICE_ACCOUNT || (projectId ? `${projectId}@appspot.gserviceaccount.com` : undefined);

setGlobalOptions({
  // Next to Firestore (eur3) and to the users.
  region: 'europe-west1',
  maxInstances: 10,
  ...(serviceAccount && process.env.FUNCTIONS_EMULATOR !== 'true' ? { serviceAccount } : {}),
});

let initialized = false;
function services() {
  if (!initialized) {
    const serviceAccountId = CUSTOM_TOKEN_SERVICE_ACCOUNT.value();
    initializeApp(serviceAccountId ? { serviceAccountId } : undefined);
    getFirestore().settings({ ignoreUndefinedProperties: true });
    initialized = true;
  }
  return { db: getFirestore(), auth: getAuth() };
}

function requireUid(request: CallableRequest): string {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'You must be logged in.');
  return request.auth.uid;
}

const REAUTH_MESSAGE = 'Your Spotify session has expired. Please log in to Spotify again.';

/**
 * Finishes the Spotify login: exchanges the authorization code, creates the
 * Firebase account if needed and returns a Firebase custom token.
 * Input: { code, redirectUri }. Output: { token, custom_auth_token }.
 */
export const spotifyLogin = onCall({ secrets: [SPOTIFY_CLIENT_SECRET], timeoutSeconds: 60, memory: '256MiB' }, async (request) => {
  const code = request.data?.code;
  const redirectUri = request.data?.redirectUri || SPOTIFY_REDIRECT_URI.value();
  if (typeof code !== 'string' || !code) throw new HttpsError('invalid-argument', 'Missing Spotify authorization code.');
  if (typeof redirectUri !== 'string' || !redirectUri) throw new HttpsError('invalid-argument', 'Missing redirect URI.');

  const { db, auth } = services();
  const config = spotifyConfig();
  try {
    const tokens = await exchangeAuthorizationCode(config, code, redirectUri);
    const profile = await fetchProfile(config, tokens.access_token);
    await upsertUser(db, auth, profile, tokens);
    const customToken = await auth.createCustomToken(profile.id);
    return { token: tokens.access_token, custom_auth_token: customToken };
  } catch (error) {
    if (error instanceof SpotifyGrantError) {
      throw new HttpsError('invalid-argument', 'This Spotify login link is no longer valid. Please log in again.', { code: 'spotify-invalid-code' });
    }
    logger.error('spotifyLogin failed', error);
    throw new HttpsError('internal', 'Login failed. Please try again.');
  }
});

/**
 * Returns a valid Spotify access token for the logged-in user, refreshing it
 * with the refresh token stored on the server when needed.
 * Output: { token }.
 */
export const spotifyRefreshToken = onCall({ secrets: [SPOTIFY_CLIENT_SECRET], timeoutSeconds: 60, memory: '256MiB' }, async (request) => {
  const uid = requireUid(request);
  const { db } = services();
  const staleToken = typeof request.data?.staleToken === 'string' ? request.data.staleToken : undefined;
  try {
    return { token: await new UserTokens(db, uid, spotifyConfig()).get(staleToken) };
  } catch (error) {
    if (error instanceof ReauthRequiredError) throw new HttpsError('failed-precondition', REAUTH_MESSAGE, { code: 'spotify-reauth' });
    logger.error('spotifyRefreshToken failed', error);
    throw new HttpsError('internal', 'Could not refresh the Spotify session. Please try again.');
  }
});

/**
 * Imports the Spotify library of the logged-in user into Firestore.
 *
 * Progress and outcome are written to `users/{uid}.import`, which the web
 * client listens to: the import keeps going if the browser tab goes away, and
 * the library itself is never sent back through this HTTP response.
 */
export const importLibrary = onCall(
  { secrets: [SPOTIFY_CLIENT_SECRET], timeoutSeconds: 3600, memory: '1GiB', concurrency: 4 },
  async (request) => {
    const uid = requireUid(request);
    const { db } = services();
    const requestsPerSecond = Math.max(1, SPOTIFY_MAX_REQUESTS_PER_SECOND.value());
    try {
      const { stats, warnings } = await runImport({
        db,
        uid,
        spotify: spotifyConfig(),
        client: {
          maxConcurrent: Math.max(1, SPOTIFY_MAX_CONCURRENT_REQUESTS.value()),
          minIntervalMs: Math.ceil(1000 / requestsPerSecond),
        },
        log: (message) => logger.info(message, { uid }),
      });
      logger.info('Library imported', { uid, ...stats });
      return { status: 'done', stats, warnings };
    } catch (error) {
      if (error instanceof ImportAlreadyRunningError) {
        throw new HttpsError('already-exists', 'Your library is already being loaded.', { code: 'import-running' });
      }
      if (error instanceof ImportError) {
        const { code, message, retryAfterSeconds } = error.failure;
        logger.error('Library import failed', { uid, code, cause: String((error.cause as Error | undefined)?.stack ?? error.cause) });
        const status = code === 'spotify-reauth' ? 'failed-precondition' : code === 'spotify-rate-limited' ? 'resource-exhausted' : code === 'internal' ? 'internal' : 'unavailable';
        throw new HttpsError(status, message, { code, retryAfterSeconds });
      }
      logger.error('Library import crashed', error);
      throw new HttpsError('internal', 'Something went wrong while loading your library. Please try again.');
    }
  }
);
