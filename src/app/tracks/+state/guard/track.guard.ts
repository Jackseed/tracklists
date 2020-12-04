import { Injectable } from '@angular/core';
import { CollectionGuard } from 'akita-ng-fire';
import { combineLatest } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { AuthQuery } from 'src/app/auth/+state';
import { PlaylistQuery } from 'src/app/playlists/+state';
import { TrackService } from '../track.service';
import { TrackState } from '../track.store';

@Injectable({
  providedIn: 'root',
})
export class TrackGuard extends CollectionGuard<TrackState> {
  constructor(
    service: TrackService,
    private authQuery: AuthQuery,
    private playlistQuery: PlaylistQuery
  ) {
    super(service);
  }

  sync() {
    const activePlaylists$ = this.playlistQuery.selectActive();
    const user$ = this.authQuery.selectActive();

    return combineLatest([activePlaylists$, user$]).pipe(
      switchMap(([playlists, user]) => {
        let trackIds: string[] = [];

        for (const playlist of playlists) {
          trackIds = trackIds.concat(playlist.trackIds);
        }

       trackIds = trackIds.concat(user.likedTracksIds);

        return this.service.syncManyDocs(trackIds.slice(200, 300));
      })
    );
  }
}
