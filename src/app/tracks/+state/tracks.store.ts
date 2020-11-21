import { Injectable } from '@angular/core';
import { Track } from './track.model';
import { EntityState, ActiveState, EntityStore, StoreConfig } from '@datorama/akita';

export interface TracksState extends EntityState<Track, string>, ActiveState<string> {}

@Injectable({ providedIn: 'root' })
@StoreConfig({ name: 'tracks' })
export class TracksStore extends EntityStore<TracksState> {

  constructor() {
    super();
  }

}

