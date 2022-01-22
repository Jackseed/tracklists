import { Injectable } from '@angular/core';
import { AuthState, AuthService, AuthStore } from '../+state';
import { CollectionGuardConfig, CollectionGuard } from 'akita-ng-fire';
import { filter, switchMap, tap } from 'rxjs/operators';
import { Auth, user } from '@angular/fire/auth';

@Injectable({ providedIn: 'root' })
@CollectionGuardConfig({ awaitSync: true })
export class ActiveGuard extends CollectionGuard<AuthState> {
  constructor(
    service: AuthService,
    private store: AuthStore,
    private auth: Auth
  ) {
    super(service);
  }

  sync() {
    return user(this.auth).pipe(
      filter((user) => !!user),
      tap((user) => this.store.setActive(user.uid)),
      switchMap((_) => this.service.syncCollection())
    );
  }
}
