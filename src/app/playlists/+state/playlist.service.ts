import { Injectable } from '@angular/core';
import { CollectionConfig, CollectionService } from 'akita-ng-fire';
import { PlaylistState, PlaylistStore } from './playlist.store';

@Injectable({ providedIn: 'root' })
@CollectionConfig({ path: 'playlists' })
export class PlaylistService extends CollectionService<PlaylistState> {
  constructor(store: PlaylistStore) {
    super(store);
  }

  public addActive(playlistId: string) {
    this.store.addActive(playlistId);
  }

  public removeActive(playlistId: string) {
    this.store.removeActive(playlistId);
  }

  public toggleActive(playlistId: string) {
    this.store.toggleActive(playlistId);
  }
}
