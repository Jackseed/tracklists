import { Injectable } from '@angular/core';
import { CollectionGuard } from 'akita-ng-fire';
import { distinctUntilChanged, pluck, switchMap, tap } from 'rxjs/operators';
import { AuthQuery } from 'src/app/auth/+state';
import { TrackService } from '../track.service';
import { TrackStore, TrackState } from '../track.store';

@Injectable({
  providedIn: 'root',
})
export class TrackGuard extends CollectionGuard<TrackState> {
  constructor(
    service: TrackService,
    private store: TrackStore,
    private authQuery: AuthQuery
  ) {
    super(service);
  }

  sync() {
    return this.authQuery.selectActive().pipe(
      pluck('likedTracksIds'),
      distinctUntilChanged((prev, curr) => prev.length === curr.length),
      tap((_) => this.store.reset()),
      switchMap((likedTracksIds) => this.service.syncManyDocs(likedTracksIds))
    );  
  }
}
