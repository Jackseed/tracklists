import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { QueryEntity } from '@datorama/akita';
import { AuthStore, AuthState } from './auth.store';

@Injectable({ providedIn: 'root' })
export class AuthQuery extends QueryEntity<AuthState> {
  constructor(protected store: AuthStore, private router: Router) {
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
}
