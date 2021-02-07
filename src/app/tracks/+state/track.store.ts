import { Injectable } from '@angular/core';
import { Track } from './track.model';
import {
  EntityState,
  EntityStore,
  MultiActiveState,
  guid,
  StoreConfig,
} from '@datorama/akita';

export interface TrackState
  extends EntityState<Track, string>,
    MultiActiveState {
  ui: {
    spinner: boolean;
    loadingItem: string;
  };
}

const initialState = {
  ui: { spinner: false, loadingItem: '' },
};

@Injectable({ providedIn: 'root' })
@StoreConfig({ name: 'tracks' })
export class TrackStore extends EntityStore<TrackState, Track> {
  constructor() {
    super(initialState);
    this.loadFromStorage();
  }
  // call storage instead of firebase
  loadFromStorage() {
    const data = localStorage.getItem('trackStore');
    if (data) {
      // don't set store if empty
      if (!data.includes(':{}')) {
        this._setState((_) => JSON.parse(data));
        this.setActive([]);
        this.setLoading(false);
      }
    }
  }
}
