import { Injectable } from '@angular/core';
import { EntityUIQuery, QueryEntity } from '@datorama/akita';
import { TrackStore, TrackState, TrackUIState } from './track.store';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class TrackQuery extends QueryEntity<TrackState> {
  ui: EntityUIQuery<TrackUIState>;

  constructor(protected store: TrackStore) {
    super(store);
    this.createUIQuery();
  }

  selectPosition(trackId: string): Observable<number> {
    return this.ui.selectEntity(trackId, 'position');
  }

  selectPaused(trackId: string): Observable<boolean> {
    return this.ui.selectEntity(trackId, 'paused');
  }

  getPaused(trackId: string): boolean {
    const track = this.ui.getEntity(trackId);
    if (!track) return;
    return track.paused;
  }

  selectGenres(): Observable<string[][]> {
    return this.selectAll().pipe(
      map((tracks) => tracks.map((track) => track.genres))
    );
  }
}
