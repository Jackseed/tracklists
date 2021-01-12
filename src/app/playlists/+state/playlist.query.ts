import { Injectable } from '@angular/core';
import { QueryEntity } from '@datorama/akita';
import { debounceTime } from 'rxjs/operators';
import { PlaylistState, PlaylistStore } from './playlist.store';

@Injectable({ providedIn: 'root' })
export class PlaylistQuery extends QueryEntity<PlaylistState> {
  constructor(protected store: PlaylistStore) {
    super(store);
    this.saveToStorage();
  }

  saveToStorage() {
    this.select()
      .pipe(debounceTime(2000))
      .subscribe((state) => {
        localStorage.setItem('playlistStore', JSON.stringify(state));
        console.log('saving playlist state ', state);
      });
  }
}
