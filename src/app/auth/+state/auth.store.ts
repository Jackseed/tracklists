import { Injectable } from '@angular/core';
import { ActiveState, EntityState, EntityStore, StoreConfig } from '@datorama/akita';
import { User } from './auth.model';

export interface AuthState extends EntityState<User, string>, ActiveState<string> {}

const initialState = {
  active: null,
};

@Injectable({ providedIn: 'root' })
@StoreConfig({ name: 'auth', idKey: 'uid' })
export class AuthStore extends EntityStore<AuthState> {
  constructor() {
    super(initialState);
  }
}
