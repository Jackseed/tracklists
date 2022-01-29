import { Injectable } from '@angular/core';
import {
  EntityState,
  EntityStore,
  MultiActiveState,
  StoreConfig,
} from '@datorama/akita';
import { LocalforageService } from '../../utils/localforage.service';
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
  constructor(private localforage: LocalforageService) {
    super(initialState);
    this.loadFromStorage();
  }
  // call storage instead of firebase
  async loadFromStorage() {
    const data: any = await this.localforage.getItem('playlistStore');
    if (data) {
      this._setState((_) => JSON.parse(data));
    }
  }
}
