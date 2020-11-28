import { Injectable } from '@angular/core';
import { AuthState, AuthStore } from './auth.store';
import { environment } from 'src/environments/environment';
import { CollectionConfig, CollectionService } from 'akita-ng-fire';
import { AngularFireAuth } from '@angular/fire/auth';
import { first, tap } from 'rxjs/operators';
import { createUser, SpotifyUser } from './auth.model';
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
    window.location.href = this.getAuthUrl();
    return false;
  }

  public async getSpotifyActiveUser(): Promise<Observable<SpotifyUser>> {
    const user = await this.query.getActive();
    const headers = new HttpHeaders().set(
      'Authorization',
      'Bearer ' + user.token
    );
    const spotifyUser = await this.http.get<SpotifyUser>(this.baseUrl, {
      headers,
    });
    spotifyUser
      .pipe(
        // save spotifyId
        tap((spotifyUser: SpotifyUser) => {
          this.db
            .collection(this.currentPath)
            .doc(user.id)
            .update({ spotifyId: spotifyUser.id });
        }, first())
      )
      .subscribe();
    return spotifyUser;
  }

  private getAuthUrl(): string {
    this.authorizeURL += '?' + 'client_id=' + this.clientId;
    this.authorizeURL += '&response_type=' + this.responseType;
    this.authorizeURL += '&redirect_uri=' + this.redirectURI;
    this.authorizeURL += '&scope=' + this.scope;
    return this.authorizeURL;
  }

  private getTokenFromUrl(): string {
    const url = this.router.url;
    const token = url.substring(url.indexOf('=') + 1, url.indexOf('&'));
    return token;
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

  public saveToken() {
    const token = this.getTokenFromUrl();
    const userId = this.query.getActiveId();
    this.db.collection(this.currentPath).doc(userId).update({ token });
    localStorage.setItem('spotify-access-token', token);
  }

  private setUser(id: string, email: string) {
    const user = createUser({ id, email });
    this.db.collection(this.currentPath).doc(id).set(user);
  }

  public async emailSignup(email: string, password: string): Promise<string> {
    let errorMessage: string;

    try {
      await this.afAuth.createUserWithEmailAndPassword(email, password);

      const user = await this.afAuth.authState.pipe(first()).toPromise();

      if (user) {
        this.setUser(user.uid, user.email);
      }
      this.router.navigate(['/home']);
    } catch (err) {
      errorMessage = err;
    }

    return errorMessage;
  }

  public async emailLogin(email: string, password: string): Promise<string> {
    let errorMessage: string;

    try {
      await this.afAuth.signInWithEmailAndPassword(email, password);
      this.router.navigate(['/home']);
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

  async signOut() {
    await this.router.navigate(['/welcome']);

    if (this.router.url.includes('welcome')) {
      await this.afAuth.signOut();
      this.store.reset();
    }
  }
}
