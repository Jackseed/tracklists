import { Injectable } from '@angular/core';
import { QueryEntity } from '@datorama/akita';
import { TrackStore, TrackState } from './track.store';
import { Observable } from 'rxjs';
import { debounceTime, map } from 'rxjs/operators';
import { Track } from './track.model';

@Injectable({ providedIn: 'root' })
export class TrackQuery extends QueryEntity<TrackState, Track> {
  constructor(protected store: TrackStore) {
    super(store);
    this.saveToStorage();
  }
  // save to storage to avoid calling firebase
  saveToStorage() {
    this.select()
      .pipe(debounceTime(2000))
      .subscribe((state) => {
        localStorage.setItem('trackStore', JSON.stringify(state));
      });
  }

  selectGenres(): Observable<string[][]> {
    return this.selectAll().pipe(
      map((tracks) => tracks.map((track) => track.genres))
    );
  }
}
