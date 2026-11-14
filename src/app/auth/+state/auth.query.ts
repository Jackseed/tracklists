import { Injectable } from '@angular/core';
import { QueryEntity } from '@datorama/akita';
import { AuthState, AuthStore } from './auth.store';

@Injectable({ providedIn: 'root' })
export class AuthQuery extends QueryEntity<AuthState> {
  constructor(protected override store: AuthStore) {
    super(store);
  }
}
