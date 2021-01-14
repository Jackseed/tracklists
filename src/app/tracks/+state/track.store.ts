import { Injectable } from '@angular/core';
import { Track } from './track.model';
import {
  EntityState,
  EntityStore,
  StoreConfig,
  EntityUIStore,
  MultiActiveState,
} from '@datorama/akita';

export type TrackUI = {
  position: number;
  paused: boolean;
};

export interface TrackState
  extends EntityState<Track, string>,
    MultiActiveState {}

export interface TrackUIState extends EntityState<TrackUI> {}

@Injectable({ providedIn: 'root' })
@StoreConfig({ name: 'tracks' })
export class TrackStore extends EntityStore<TrackState> {
  ui: EntityUIStore<TrackUIState>;

  constructor() {
    super();
    this.createUIStore().setInitialEntityState({
      position: 0,
      paused: false,
    });
    this.loadFromStorage();
  }
  // call storage instead of firebase
  loadFromStorage() {
    const data = localStorage.getItem('trackStore');
    if (data) {
      this._setState((_) => JSON.parse(data));
    }
  }
}
