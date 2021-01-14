import { Injectable } from '@angular/core';
import { EntityUIQuery, QueryEntity } from '@datorama/akita';
import { TrackStore, TrackState, TrackUIState } from './track.store';
import { Observable } from 'rxjs';
import { debounceTime, map } from 'rxjs/operators';
import { Track } from './track.model';

@Injectable({ providedIn: 'root' })
export class TrackQuery extends QueryEntity<TrackState, Track> {
  ui: EntityUIQuery<TrackUIState>;

  constructor(protected store: TrackStore) {
    super(store);
    this.createUIQuery();
    this.saveToStorage();
  }

  saveToStorage() {
    this.select()
      .pipe(debounceTime(2000))
      .subscribe((state) => {
        localStorage.setItem('trackStore', JSON.stringify(state));
        console.log('saving state ', state);
      });
  }

  selectPosition(trackId: string): Observable<number> {
    return this.ui.selectEntity(trackId, 'position');
  }

  selectPaused(trackId: string): Observable<boolean> {
    return this.ui.selectEntity(trackId, 'paused');
  }

  getPaused(trackId: string): boolean {
    const track = this.ui.getEntity(trackId);
    if (!track) return;
    return track.paused;
  }

  selectGenres(): Observable<string[][]> {
    return this.selectAll().pipe(
      map((tracks) => tracks.map((track) => track.genres))
    );
  }
}
