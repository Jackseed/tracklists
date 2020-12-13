import { Injectable } from '@angular/core';
import { Track } from './track.model';
import {
  EntityState,
  ActiveState,
  EntityStore,
  StoreConfig,
  EntityUIStore,
} from '@datorama/akita';

export type TrackUI = {
  position: number;
  paused: boolean;
};

export interface TrackState
  extends EntityState<Track, string>,
    ActiveState<string> {
  hasMore: boolean;
  page: number;
}

export interface TrackUIState extends EntityState<TrackUI> {}

@Injectable({ providedIn: 'root' })
@StoreConfig({ name: 'tracks' })
export class TrackStore extends EntityStore<TrackState> {
  ui: EntityUIStore<TrackUIState>;

  constructor() {
    super({ page: 0, hasMore: true });
    this.createUIStore().setInitialEntityState({
      position: 0,
      paused: false,
    });
  }
}
