import { Injectable } from '@angular/core';
import { ActiveState, EntityStore, StoreConfig } from '@datorama/akita';
import { CollectionState } from 'akita-ng-fire/lib/collection/collection.service';
import { User } from './auth.model';

export interface AuthState extends CollectionState<User>, ActiveState<string> {}

const initialState = {
  active: null,
};

@Injectable({ providedIn: 'root' })
@StoreConfig({ name: 'auth' })
export class AuthStore extends EntityStore<AuthState> {
  constructor() {
    super(initialState);
  }
}

