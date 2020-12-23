import { Injectable } from '@angular/core';
import { CollectionGuard } from 'akita-ng-fire';
import { switchMap } from 'rxjs/operators';
import { PlaylistQuery } from 'src/app/playlists/+state';
import { TrackService } from '../track.service';
import { TrackState, TrackStore } from '../track.store';

@Injectable({
  providedIn: 'root',
})
export class TrackGuard extends CollectionGuard<TrackState> {
  constructor(
    service: TrackService,
    private store: TrackStore,
    private playlistQuery: PlaylistQuery
  ) {
    super(service);
  }

  sync() {
    const activePlaylists$ = this.playlistQuery.selectActive();

    return activePlaylists$.pipe(
      switchMap((playlists) => {
        let trackIds: string[] = [];

        for (const playlist of playlists) {
          trackIds = trackIds.concat(playlist.trackIds);
        }
        this.store.set({});
        return this.service.syncManyDocs(trackIds);
      })
    );
  }
}
