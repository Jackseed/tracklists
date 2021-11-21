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
      tap((_) => this.trackService.updateSpinner(true)),
      tap((_) => this.store.setActive([])),
      // Ugly fix to stop blinking on loading.
      distinctUntilKeyChanged('playlistIds'),
      debounceTime(2000),
      switchMap((user) => this.service.syncManyDocs(user.playlistIds)),
      tap((_) => this.trackService.updateSpinner(false))
    );
  }
}
