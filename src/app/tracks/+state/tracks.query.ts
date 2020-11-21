import { Injectable } from '@angular/core';
import { QueryEntity } from '@datorama/akita';
import { TracksStore, TracksState } from './tracks.store';

@Injectable({ providedIn: 'root' })
export class TracksQuery extends QueryEntity<TracksState> {

  constructor(protected store: TracksStore) {
    super(store);
  }

}
