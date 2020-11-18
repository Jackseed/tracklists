import { Injectable } from "@angular/core";
import { AuthState, AuthService, AuthStore } from "../+state";
import { AngularFireAuth } from "@angular/fire/auth";
import { CollectionGuardConfig, CollectionGuard } from "akita-ng-fire";
import { switchMap, tap } from "rxjs/operators";

@Injectable({ providedIn: "root" })
@CollectionGuardConfig({ awaitSync: true })
export class ActiveGuard extends CollectionGuard<AuthState> {
  constructor(
    service: AuthService,
    private store: AuthStore,
    private afAuth: AngularFireAuth
  ) {
    super(service);
  }

  sync() {
    return this.afAuth.user.pipe(
      tap((user) => this.store.setActive(user.uid)),
      switchMap((_) => this.service.syncCollection())
    );
  }
}
