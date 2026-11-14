// Angular
import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { environment } from '../../../environments/environment';
// Firebase
import { signInWithCustomToken, signOut } from 'firebase/auth';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
// Rxjs
import { Observable } from 'rxjs';
// Akita
import { resetStores } from '@datorama/akita';
// App
import { AUTH, FIRESTORE, FUNCTIONS } from '../../core/firebase';
import { LocalforageService } from '../../utils/localforage.service';
import { AuthStore } from './auth.store';
import { AuthQuery } from './auth.query';
import { Tokens, User } from './auth.model';

const SCOPES = [
  'user-read-email',
  'user-read-currently-playing',
  'user-modify-playback-state',
  'streaming',
  'user-read-playback-state',
  'user-read-private',
  'user-top-read',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-library-read',
  'playlist-modify-public',
  'playlist-modify-private',
  'user-library-modify',
];

/** A Spotify access token lives one hour: ask for a new one a bit before. */
const MAX_TOKEN_AGE_MS = 50 * 60 * 1000;

@Injectable({ providedIn: 'root' })
export class AuthService {
  private store = inject(AuthStore);
  private query = inject(AuthQuery);
  private auth = inject(AUTH);
  private firestore = inject(FIRESTORE);
  private functions = inject(FUNCTIONS);
  private router = inject(Router);
  private localforage = inject(LocalforageService);

  private refreshing?: Promise<string>;

  //--------------------------------
  //         SPOTIFY LOGIN        //
  //--------------------------------
  /** Sends the browser to Spotify's consent page; Spotify comes back to /login?code=... */
  public authSpotify() {
    const params = new URLSearchParams({
      client_id: environment.spotify.clientId,
      response_type: 'code',
      redirect_uri: environment.spotify.redirectURI,
      scope: SCOPES.join(' '),
    });
    window.location.href = `${environment.spotify.accountsUrl}/authorize?${params}`;
  }

  /** Completes the login with the code Spotify appended to the redirect URI. */
  public async loginWithCode(code: string): Promise<void> {
    const login = httpsCallable<{ code: string; redirectUri: string }, Tokens>(this.functions, 'spotifyLogin');
    const { data } = await login({ code, redirectUri: environment.spotify.redirectURI });
    await signInWithCustomToken(this.auth, data.custom_auth_token);
  }

  //--------------------------------
  //         SPOTIFY TOKEN        //
  //--------------------------------
  /**
   * Returns a valid Spotify access token: the one synced from the user
   * document while it is fresh, otherwise a new one from the server (which
   * keeps the refresh token).
   */
  public async getAccessToken(forceRefresh = false): Promise<string> {
    const tokens = this.query.getActive()?.tokens;
    const age = tokens?.addedTime ? Date.now() - tokens.addedTime.toMillis() : Infinity;
    if (!forceRefresh && tokens?.access && age < MAX_TOKEN_AGE_MS) return tokens.access;
    // Player, playback calls...: concurrent callers share one refresh.
    this.refreshing ??= this.refreshToken(forceRefresh ? tokens?.access : undefined).finally(() => (this.refreshing = undefined));
    return this.refreshing;
  }

  private async refreshToken(staleToken?: string): Promise<string> {
    const refresh = httpsCallable<{ staleToken?: string }, Tokens>(this.functions, 'spotifyRefreshToken');
    const { data } = await refresh(staleToken ? { staleToken } : {});
    return data.token;
  }

  //--------------------------------
  //          USER STATE          //
  //--------------------------------
  /**
   * Keeps the store in sync with the signed-in user's own document. Emits the
   * user on each change, `null` if the document does not exist.
   */
  public syncUser(uid: string): Observable<User | null> {
    return new Observable((subscriber) =>
      onSnapshot(
        doc(this.firestore, `users/${uid}`),
        (snapshot) => {
          if (!snapshot.exists()) return subscriber.next(null);
          const user = { ...(snapshot.data() as User), uid };
          this.store.upsert(uid, user);
          this.store.setActive(uid);
          subscriber.next(user);
        },
        (error) => subscriber.error(error)
      )
    );
  }

  public saveDeviceId(deviceId: string) {
    const userId = this.query.getActiveId();
    if (!userId) return;
    updateDoc(doc(this.firestore, `users/${userId}`), { deviceId }).catch((error) => console.warn('[AuthService] could not save the device id:', error));
  }

  public async signOut() {
    await signOut(this.auth);
    await this.router.navigate(['']);
    resetStores();
    await this.localforage.clear();
  }
}
