import { Injectable } from '@angular/core';
import { AngularFireFunctions } from '@angular/fire/functions';
import { Router } from '@angular/router';
import { QueryEntity } from '@datorama/akita';
import { Observable } from 'rxjs';
import { filter, first, map, mergeMap, switchMap, tap } from 'rxjs/operators';
import { AuthStore, AuthState } from './auth.store';
import firebase from 'firebase/app';
import { SpotifyUser } from './auth.model';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from 'src/environments/environment';

@Injectable({ providedIn: 'root' })
export class AuthQuery extends QueryEntity<AuthState> {
  baseUrl: string = environment.spotify.apiUrl;
  constructor(
    protected store: AuthStore,
    private router: Router,
    private fns: AngularFireFunctions,
    private http: HttpClient
  ) {
    super(store);
  }

  public get token(): string {
    const user = this.getActive();
    let token;
    if (user) {
      token = user.token;
    } else {
      const url = this.router.url;
      token = url.substring(url.indexOf('=') + 1, url.indexOf('&'));
    }

    return token;
  }

  public get token$(): Observable<string> {
    return this.selectActive().pipe(
      filter((user) => !!user),
      filter((user) => !!user.tokens),
      map((user) => {
        // refresh token if access token is older than an hour
        if (
          (firebase.firestore.Timestamp.now().toMillis() -
            user.tokens.addedTime.toMillis()) /
            1000 >
          3600
        ) {
          const getTokenFunction = this.fns.httpsCallable('getSpotifyToken');
          const response = getTokenFunction({
            tokenType: 'refresh',
            userId: user.id,
            refreshToken: user.tokens.refresh,
          })
            .pipe(first())
            .subscribe();
        }
        return user.tokens.access;
      })
    );
  }

  public selectSpotifyUserId(): Observable<string> {
    const user = this.getActive();
    // save spotify userId if not done yet
    if (!user.spotifyId) {
      const token$ = this.token$;
      const spotifyUser = token$
        .pipe(
          map((token) => {
            const headers: HttpHeaders = new HttpHeaders().set(
              'Authorization',
              'Bearer ' + token
            );
            return headers;
          }),
          mergeMap((headers) =>
            this.http.get<SpotifyUser>(this.baseUrl, {
              headers,
            })
          ),
          tap((spotifyUser: SpotifyUser) => {
            if (user) {
              firebase
                .firestore()
                .collection('users')
                .doc(user.id)
                .update({ spotifyId: spotifyUser.id });
            }
          }),
          first()
        )
        .subscribe();
    }

    return this.selectActive().pipe(map((user) => user.spotifyId));
  }
}
