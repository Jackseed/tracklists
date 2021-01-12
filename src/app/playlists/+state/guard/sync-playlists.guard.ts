import { Injectable } from '@angular/core';
import { CollectionGuard } from 'akita-ng-fire';
import { PlaylistState, PlaylistService } from '..';
import { pluck, switchMap, tap } from 'rxjs/operators';
import { AuthQuery } from 'src/app/auth/+state';
import { PlaylistStore } from '../playlist.store';
import { TrackService } from 'src/app/tracks/+state';

@Injectable({
  providedIn: 'root',
})
export class SyncPlaylistsGuard extends CollectionGuard<PlaylistState> {
  constructor(
    service: PlaylistService,
    private store: PlaylistStore,
    private authQuery: AuthQuery,
    private trackService: TrackService
  ) {
    super(service);
  }

  sync() {
    return this.authQuery.selectActive().pipe(
      pluck('playlistIds'),
      // set all playlist active
      tap((_) => this.store.setActive([])),
      switchMap((playlistIds) => this.service.syncManyDocs(playlistIds))
    );
  }
}
