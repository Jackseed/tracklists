import { Injectable } from '@angular/core';
import {
  EntityState,
  EntityStore,
  MultiActiveState,
  StoreConfig,
} from '@datorama/akita';
import { Playlist } from './playlist.model';

export interface PlaylistState
  extends EntityState<Playlist, string>,
    MultiActiveState {}
const initialState = {
  active: [],
};
@Injectable({ providedIn: 'root' })
@StoreConfig({ name: 'playlists' })
export class PlaylistStore extends EntityStore<PlaylistState, Playlist> {
  constructor() {
    super(initialState);
    this.loadFromStorage();
  }
  // call storage instead of firebase
  loadFromStorage() {
    const data = localStorage.getItem('playlistStore');
    if (data) {
      this._setState((_) => JSON.parse(data));
    }
  }
}
