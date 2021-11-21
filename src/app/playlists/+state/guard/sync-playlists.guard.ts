import { Injectable } from '@angular/core';
import { CollectionGuard } from 'akita-ng-fire';
import { PlaylistState, PlaylistService } from '..';
import {
  debounceTime,
  distinctUntilKeyChanged,
  switchMap,
  tap,
} from 'rxjs/operators';
import { AuthQuery } from 'src/app/auth/+state';
import { PlaylistStore } from '../playlist.store';

@Injectable({
  providedIn: 'root',
})
export class SyncPlaylistsGuard extends CollectionGuard<PlaylistState> {
  constructor(
    service: PlaylistService,
    private store: PlaylistStore,
    private authQuery: AuthQuery
  ) {
    super(service);
  }

  sync() {
    return this.authQuery.selectActive().pipe(
      tap((_) => this.store.setActive([])),
      // Ugly fix to stop blinking on loading.
      distinctUntilKeyChanged('playlistIds'),
      debounceTime(10000),
      switchMap((user) => this.service.syncManyDocs(user.playlistIds))
    );
  }
}
