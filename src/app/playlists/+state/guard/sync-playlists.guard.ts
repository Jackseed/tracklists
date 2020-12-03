import { Injectable } from '@angular/core';
import { CollectionGuard } from 'akita-ng-fire';
import { PlaylistState, PlaylistService, PlaylistStore } from '..';
import { distinctUntilChanged, pluck, switchMap, tap } from 'rxjs/operators';
import { AuthQuery } from 'src/app/auth/+state';

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
      pluck('playlistIds'),
      distinctUntilChanged((prev, curr) => prev.length === curr.length),
      tap((_) => this.store.reset()),
      switchMap((playlistIds) => this.service.syncManyDocs(playlistIds))
    );
  }
}
