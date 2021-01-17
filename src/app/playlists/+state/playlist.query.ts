import { Injectable } from '@angular/core';
import { QueryEntity } from '@datorama/akita';
import { Observable, of } from 'rxjs';
import { debounceTime, switchMap } from 'rxjs/operators';
import { Playlist } from './playlist.model';
import { PlaylistState, PlaylistStore } from './playlist.store';

@Injectable({ providedIn: 'root' })
export class PlaylistQuery extends QueryEntity<PlaylistState> {
  constructor(protected store: PlaylistStore) {
    super(store);
    this.saveToStorage();
  }

  // save to storage to avoid calling firebase
  saveToStorage() {
    this.select()
      .pipe(debounceTime(2000))
      .subscribe((state) => {
        localStorage.setItem('playlistStore', JSON.stringify(state));
      });
  }

  public get likedTracksPlaylist(): Observable<Playlist> {
    return this.selectAll({
      filterBy: (playlist) => playlist.type === 'likedTracks',
      limitTo: 1,
    }).pipe(switchMap((playlists) => of(playlists[0])));
  }
}
