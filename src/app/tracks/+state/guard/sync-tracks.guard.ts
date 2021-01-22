import { Injectable } from '@angular/core';
import { CanActivate } from '@angular/router';
import { first, map } from 'rxjs/operators';
import { TrackQuery } from '../track.query';
import { TrackService } from '../track.service';

@Injectable({
  providedIn: 'root',
})
export class SyncTracksGuard implements CanActivate {
  constructor(
    private trackQuery: TrackQuery,
    private trackService: TrackService
  ) {}

  canActivate() {
    const isTrackstoreLoading$ = this.trackQuery.selectLoading().pipe(
      map((isLoading) => !isLoading),
      first()
    );
    this.trackService.setFirestoreTracks();
    isTrackstoreLoading$.subscribe(console.log);
    return isTrackstoreLoading$;
  }
}
