import { Injectable } from '@angular/core';
import { CollectionConfig, CollectionService } from 'akita-ng-fire';
import { PlaylistState, PlaylistStore } from './playlist.store';

@Injectable({ providedIn: 'root' })
@CollectionConfig({ path: 'playlists' })
export class PlaylistService extends CollectionService<PlaylistState> {
  constructor(store: PlaylistStore) {
    super(store);
  }
}
