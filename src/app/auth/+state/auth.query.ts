import { Injectable } from '@angular/core';
import { AngularFireFunctions } from '@angular/fire/functions';
import { Router } from '@angular/router';
import { QueryEntity } from '@datorama/akita';
import { Observable } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import { AuthStore, AuthState } from './auth.store';
import firebase from 'firebase/app';

@Injectable({ providedIn: 'root' })
export class AuthQuery extends QueryEntity<AuthState> {
  constructor(
    protected store: AuthStore,
    private router: Router,
    private fns: AngularFireFunctions
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
          }).subscribe(console.log);
        }
        console.log('token: ', user.tokens.access);
        return user.tokens.access;
      })
    );
  }
}
