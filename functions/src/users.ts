import { Auth } from 'firebase-admin/auth';
import { Firestore } from 'firebase-admin/firestore';
import { SpotifyProfile, SpotifyTokenResponse } from './spotify/accounts';
import { saveTokens } from './tokens';

const authErrorCode = (error: unknown): string | undefined => (error as { code?: string } | null)?.code;

/**
 * Creates or updates the Firebase account and the `users/{uid}` document of a
 * Spotify user. The Firebase uid is the Spotify user id.
 */
export async function upsertUser(db: Firestore, auth: Auth, profile: SpotifyProfile, tokens: SpotifyTokenResponse): Promise<void> {
  const uid = profile.id;
  const displayName = profile.display_name || undefined;
  const email = profile.email || undefined;

  const exists = await auth.getUser(uid).then(
    () => true,
    (error) => {
      if (authErrorCode(error) === 'auth/user-not-found') return false;
      throw error;
    }
  );
  const apply = (properties: { displayName?: string; email?: string }) =>
    exists ? auth.updateUser(uid, properties) : auth.createUser({ uid, ...properties });
  try {
    await apply({ displayName, email });
  } catch (error) {
    // The e-mail is only informative: do not block the login if Firebase refuses it
    // (already used by another account, or not a valid address).
    const code = authErrorCode(error);
    if (code !== 'auth/email-already-exists' && code !== 'auth/invalid-email') throw error;
    await apply({ displayName });
  }

  const ref = db.doc(`users/${uid}`);
  const snapshot = await ref.get();
  const data: Record<string, unknown> = { uid };
  if (displayName) data.displayName = displayName;
  if (email) data.email = email;
  // The web client expects `playlistIds` to always be an array.
  if (!Array.isArray(snapshot.get('playlistIds'))) data.playlistIds = [];
  await ref.set(data, { merge: true });
  await saveTokens(db, uid, tokens.access_token, tokens.refresh_token);
}
