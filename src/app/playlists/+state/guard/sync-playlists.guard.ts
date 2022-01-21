import { Injectable } from '@angular/core';
import { CollectionGuard } from 'akita-ng-fire';
import { PlaylistState, PlaylistService } from '..';
import {
  debounceTime,
  distinctUntilChanged,
  pluck,
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
      pluck('playlistIds'),
      // If playlists have already been saved,
      // spawns spinner the time to load it.
      tap((ids) => {
        if (ids.length > 0) this.trackService.updateSpinner(true);
      }),
      tap((_) => this.store.setActive([])),
      // Ugly fix to stop blinking on loading.
      distinctUntilChanged(),
      debounceTime(2000),
      switchMap((ids) => this.service.syncManyDocs(ids)),
      // Stops spinning.
      tap((ids: string[]) => {
        if (ids.length > 0) this.trackService.updateSpinner(false);
      })
    );
  }
}
