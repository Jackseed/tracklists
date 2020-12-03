import { Injectable } from '@angular/core';
import {
  ActiveState,
  EntityState,
  EntityStore,
  StoreConfig,
} from '@datorama/akita';
import { Playlist } from './playlist.model';

export interface PlaylistState
  extends EntityState<Playlist, string>,
    ActiveState<string> {}

@Injectable({ providedIn: 'root' })
@StoreConfig({ name: 'playlists' })

export class PlaylistStore extends EntityStore<PlaylistState> {
  constructor() {
    super();
  }
}
