import { Injectable } from '@angular/core';
import { AuthState, AuthStore } from './auth.store';
import { environment } from 'src/environments/environment';
import { CollectionConfig, CollectionService } from 'akita-ng-fire';
import { AngularFireAuth } from '@angular/fire/auth';
import { first, tap } from 'rxjs/operators';
import { createUser, SpotifyUser, User } from './auth.model';
import { Router } from '@angular/router';
import { AuthQuery } from './auth.query';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firestore } from 'firebase/app';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
@CollectionConfig({ path: 'users' })
export class AuthService extends CollectionService<AuthState> {
  authorizeURL = 'https://accounts.spotify.com/authorize';
  clientId: string = environment.spotify.clientId;
  baseUrl: string = environment.spotify.apiUrl;
  responseType: string = 'token';
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
    private http: HttpClient
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

  public async getSpotifyActiveUser(): Promise<Observable<SpotifyUser>> {
    const user = await this.query.getActive();
    const token = this.query.token;
    const headers = new HttpHeaders().set('Authorization', 'Bearer ' + token);
    const spotifyUser = await this.http.get<SpotifyUser>(this.baseUrl, {
      headers,
    });
    spotifyUser
      .pipe(
        // save spotifyId
        tap((spotifyUser: SpotifyUser) => {
          if (user) {
            this.db
              .collection(this.currentPath)
              .doc(user.id)
              .update({ spotifyId: spotifyUser.id });
          }
        }, first())
      )
      .subscribe();
    return spotifyUser;
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

  public saveToken() {
    const url = this.router.url;
    const token = url.substring(url.indexOf('=') + 1, url.indexOf('&'));
    const userId = this.query.getActiveId();
    this.db.collection('users').doc(userId).update({ token });
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
      })
      .catch((err) => console.log(err));
  }

  public async emailLogin(email: string, password: string): Promise<string> {
    let errorMessage: string;

    try {
      await this.afAuth.signInWithEmailAndPassword(email, password);
      await this.router.navigate(['/home']);
    } catch (err) {
      errorMessage = err;
    }

    return errorMessage;
  }

  public async resetPassword(email: string): Promise<string> {
    let errorMessage: string;

    try {
      await this.afAuth.sendPasswordResetEmail(email);
    } catch (err) {
      errorMessage = err;
    }

    return errorMessage;
  }

  public signOut() {
    this.afAuth
      .signOut()
      .then((_) =>
        this.router
          .navigate(['/welcome'])
          .then((_) => this.router.navigate(['/welcome']))
      );
  }
}
