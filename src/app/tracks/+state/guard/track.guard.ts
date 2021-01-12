import { Injectable } from '@angular/core';
import { CollectionGuard } from 'akita-ng-fire';
import { pluck, switchMap, tap } from 'rxjs/operators';
import { AuthQuery } from 'src/app/auth/+state';
import { TrackService } from '../track.service';
import { TrackState, TrackStore } from '../track.store';

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
      pluck('trackIds'),
      //tap((trackIds) => this.store.setActive(trackIds)),
      switchMap((trackIds) => this.service.syncManyDocs(trackIds))
    );
  }
}
