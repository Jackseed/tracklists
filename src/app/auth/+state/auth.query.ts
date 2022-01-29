import { Injectable } from '@angular/core';
import { QueryEntity } from '@datorama/akita';
import { AuthStore, AuthState } from './auth.store';

import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AuthQuery extends QueryEntity<AuthState> {
  baseUrl: string = environment.spotify.apiUrl;
  constructor(protected store: AuthStore) {
    super(store);
  }
}
