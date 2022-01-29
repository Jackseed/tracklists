// Angular
import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { environment } from '../../../environments/environment';
// Angularfire
import {
  doc,
  Firestore,
  setDoc,
  updateDoc,
  arrayUnion,
} from '@angular/fire/firestore';
import {
  Auth,
  createUserWithEmailAndPassword,
  getAuth,
  sendPasswordResetEmail,
  signInWithCustomToken,
  signInWithEmailAndPassword,
  signOut,
  UserCredential,
} from '@angular/fire/auth';
import {
  Functions,
  HttpsCallable,
  httpsCallable,
} from '@angular/fire/functions';
// Akita (ng fire)
import { CollectionConfig, CollectionService } from 'akita-ng-fire';
import { resetStores } from '@datorama/akita';
// Localforage
import { LocalforageService } from '../../utils/localforage.service';
// Auth state
import { AuthState, AuthStore } from './auth.store';
import { AuthQuery } from './auth.query';
import { createUser, Tokens, User } from './auth.model';

@Injectable({ providedIn: 'root' })
@CollectionConfig({ path: 'users' })
export class AuthService extends CollectionService<AuthState> {
  authorizeURL = 'https://accounts.spotify.com/authorize';
  clientId: string = environment.spotify.clientId;
  baseUrl: string = environment.spotify.apiUrl;
  responseType: string = 'code';
  redirectURI = environment.spotify.redirectURI;
  scope = [
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
  ].join('%20');

  constructor(
    store: AuthStore,
    private query: AuthQuery,
    private auth: Auth,
    private router: Router,
    private functions: Functions,
    private localforage: LocalforageService,
    private firestore: Firestore
  ) {
    super(store);
  }
  //--------------------------------
  //         SPOTIFY TOKEN        //
  //--------------------------------
  public authSpotify() {
    this.authorizeURL += '?' + 'client_id=' + this.clientId;
    this.authorizeURL += '&response_type=' + this.responseType;
    this.authorizeURL += '&redirect_uri=' + this.redirectURI;
    this.authorizeURL += '&scope=' + this.scope;

    window.location.href = this.authorizeURL;
  }

  // Gets & saves access token if code as param, otherwise refreshes.
  public async getToken(code?: string): Promise<Tokens> {
    const user = this.query.getActive();
    const getTokenFunction: HttpsCallable<unknown, unknown> = httpsCallable(
      this.functions,
      'getSpotifyToken'
    );
    let param: Object;
    code
      ? (param = { code: code, tokenType: 'access' })
      : (param = {
          tokenType: 'refresh',
          refreshToken: user.tokens.refresh,
          userId: user.uid,
        });
    const token: Tokens = (await getTokenFunction(param)).data as Tokens;
    return token;
  }

  public signInWithCustomToken(token: string): Promise<UserCredential> {
    const auth = getAuth();
    return signInWithCustomToken(auth, token);
  }

  public addLikedTrack(trackId: string) {
    const userId = this.query.getActiveId();
    const userDoc = doc(this.firestore, `users/${userId}`);
    updateDoc(userDoc, {
      likedTracksIds: arrayUnion(trackId),
    });
  }

  public saveDeviceId(deviceId: string) {
    const userId = this.query.getActiveId();
    const userDoc = doc(this.firestore, `users/${userId}`);
    updateDoc(userDoc, {
      deviceId,
    });
  }

  public saveSpotifyCode() {
    const url = this.router.url;
    const code = url.substring(url.indexOf('=') + 1);
    const userId = this.query.getActiveId();
    const userDoc = doc(this.firestore, `users/${userId}`);
    updateDoc(userDoc, {
      code,
    });
  }

  private async setUser(uid: string, email: string): Promise<User> {
    const user = createUser({ uid, email });
    const userDoc = doc(this.firestore, `users/${uid}`);
    await setDoc(userDoc, user).catch((err) => console.log(err));
    return user;
  }

  public async emailSignup(email: string, password: string) {
    return createUserWithEmailAndPassword(this.auth, email, password).then(
      (user) => {
        return this.setUser(user.user.uid, user.user.email);
      }
    );
  }

  public async emailLogin(
    email: string,
    password: string
  ): Promise<UserCredential> {
    const auth = getAuth();
    return signInWithEmailAndPassword(auth, email, password);
  }

  public async resetPassword(email: string): Promise<void> {
    return sendPasswordResetEmail(this.auth, email);
  }

  public signOut() {
    signOut(this.auth).then((_) =>
      this.router.navigate(['']).then((_) => {
        this.router.navigate(['']);
        resetStores();
        this.localforage.removeItem('trackStore');
        this.localforage.removeItem('playlistStore');
      })
    );
  }
}
