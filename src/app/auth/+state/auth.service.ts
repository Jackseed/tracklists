import { Injectable } from '@angular/core';
import { AuthState, AuthStore } from './auth.store';
import { environment } from 'src/environments/environment';
import { CollectionConfig, CollectionService } from 'akita-ng-fire';
import { AngularFireAuth } from '@angular/fire/auth';
import { Router } from '@angular/router';
import { AuthQuery } from './auth.query';
import { firestore } from 'firebase/app';
import { resetStores } from '@datorama/akita';
import { LocalforageService } from 'src/app/utils/localforage.service';
import { createUser, User } from './auth.model';

@Injectable({ providedIn: 'root' })
@CollectionConfig({ path: 'users' })
export class AuthService extends CollectionService<AuthState> {
  authorizeURL = 'https://accounts.spotify.com/authorize';
  clientId: string = environment.spotify.clientId;
  baseUrl: string = environment.spotify.apiUrl;
  responseType: string = 'code';
  redirectURI = environment.spotify.redirectURI;
  // TODO: change for necessary scope only
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
    private afAuth: AngularFireAuth,
    private router: Router,

    private localforage: LocalforageService
  ) {
    super(store);
  }

  public authSpotify() {
    this.authorizeURL += '?' + 'client_id=' + this.clientId;
    this.authorizeURL += '&response_type=' + this.responseType;
    this.authorizeURL += '&redirect_uri=' + this.redirectURI;
    this.authorizeURL += '&scope=' + this.scope;

    window.location.href = this.authorizeURL;
  }

  public addLikedTrack(trackId: string) {
    const userId = this.query.getActiveId();
    this.db
      .collection(this.currentPath)
      .doc(userId)
      .update({
        likedTracksIds: firestore.FieldValue.arrayUnion(trackId),
      });
  }

  public saveDeviceId(deviceId: string) {
    const userId = this.query.getActiveId();
    this.db.collection(this.currentPath).doc(userId).update({
      deviceId,
    });
  }

  public saveSpotifyCode() {
    const url = this.router.url;
    const code = url.substring(url.indexOf('=') + 1);
    const userId = this.query.getActiveId();
    this.db.collection('users').doc(userId).update({ code });
  }

  private async setUser(id: string, email: string): Promise<User> {
    const user = createUser({ id, email });
    await this.db.collection(this.currentPath).doc(id).set(user);
    return user;
  }

  public async emailSignup(email: string, password: string) {
    return this.afAuth
      .createUserWithEmailAndPassword(email, password)
      .then((user) => {
        return this.setUser(user.user.uid, user.user.email);
      });
  }

  public async emailLogin(
    email: string,
    password: string
  ): Promise<firebase.auth.UserCredential> {
    return this.afAuth.signInWithEmailAndPassword(email, password);
  }

  public async resetPassword(email: string): Promise<void> {
    return this.afAuth.sendPasswordResetEmail(email);
  }

  public signOut() {
    this.afAuth.signOut().then((_) =>
      this.router.navigate(['/welcome']).then((_) => {
        this.router.navigate(['/welcome']);
        resetStores();
        this.localforage.removeItem('trackStore');
        this.localforage.removeItem('playlistStore');
      })
    );
  }
}
