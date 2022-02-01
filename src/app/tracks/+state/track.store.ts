import { Injectable } from '@angular/core';
import { Track } from './track.model';
import {
  EntityState,
  EntityStore,
  MultiActiveState,
  StoreConfig,
} from '@datorama/akita';
import { LocalforageService } from '../../utils/localforage.service';

export interface TrackState
  extends EntityState<Track, string>,
    MultiActiveState {
  ui: {
    spinner: boolean;
  };
}
const initialState = {
  ui: { spinner: false },
};

@Injectable({ providedIn: 'root' })
@StoreConfig({ name: 'tracks' })
export class TrackStore extends EntityStore<TrackState, Track> {
  constructor(private localforage: LocalforageService) {
    super(initialState);
    this.loadFromStorage();
  }
  // Calls local storage instead of firebase when it's loaded
  async loadFromStorage() {
    const data: any = await this.localforage.getItem('trackStore');
    if (!data || data.includes(':{}')) return;

    this._setState((_) => JSON.parse(data));
    this.setActive([]);
    this.setLoading(false);
  }
}
