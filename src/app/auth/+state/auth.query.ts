import { Injectable } from '@angular/core';
import { QueryEntity } from '@datorama/akita';
import { AuthStore, AuthState } from './auth.store';

@Injectable({ providedIn: 'root' })
export class AuthQuery extends QueryEntity<AuthState> {

  constructor(protected store: AuthStore) {
    super(store);
  }

}
