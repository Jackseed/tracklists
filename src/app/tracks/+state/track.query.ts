import { Injectable } from '@angular/core';
import { EntityUIQuery, QueryEntity } from '@datorama/akita';
import { TrackStore, TrackState, TrackUIState } from './track.store';
import { Observable } from 'rxjs';

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
    return this.ui.getEntity(trackId).paused;
  }
}
