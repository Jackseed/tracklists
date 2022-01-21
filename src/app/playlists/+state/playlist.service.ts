import { Injectable } from '@angular/core';
import { CollectionConfig, CollectionService } from 'akita-ng-fire';
import { arrayRemove, arrayUnion } from 'firebase/firestore';
import { PlaylistState, PlaylistStore } from './playlist.store';

@Injectable({ providedIn: 'root' })
@CollectionConfig({ path: 'playlists' })
export class PlaylistService extends CollectionService<PlaylistState> {
  constructor(store: PlaylistStore) {
    super(store);
  }

  public addActive(playlistIds: string[]) {
    this.store.addActive(playlistIds);
  }

  public removeActive(playlistIds: string[]) {
    this.store.removeActive(playlistIds);
  }

  public toggleActive(playlistId: string) {
    this.store.toggleActive(playlistId);
  }

  public addTrack(playlistId: string, trackId: string) {
    this.db
      .collection(this.currentPath)
      .doc(playlistId)
      .update({ trackIds: arrayUnion(trackId) });
  }

  public removeTrack(playlistId: string, trackId: string) {
    this.db
      .collection(this.currentPath)
      .doc(playlistId)
      .update({ trackIds: arrayRemove(trackId) });
  }
}
