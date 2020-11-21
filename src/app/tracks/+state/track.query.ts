import { Injectable } from '@angular/core';
import { QueryEntity } from '@datorama/akita';
import { TracksStore, TrackState } from './track.store';

@Injectable({ providedIn: 'root' })
export class TrackQuery extends QueryEntity<TrackState> {

  constructor(protected store: TracksStore) {
    super(store);
  }

}
