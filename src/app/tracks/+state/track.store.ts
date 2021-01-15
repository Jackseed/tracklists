import { Injectable } from '@angular/core';
import { Track } from './track.model';
import {
  EntityState,
  EntityStore,
  StoreConfig,
  MultiActiveState,
} from '@datorama/akita';

export interface TrackState
  extends EntityState<Track, string>,
    MultiActiveState {}

@Injectable({ providedIn: 'root' })
@StoreConfig({ name: 'tracks' })
export class TrackStore extends EntityStore<TrackState, Track> {
  constructor() {
    super();
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
