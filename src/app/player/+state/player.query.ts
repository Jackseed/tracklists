import { Injectable } from '@angular/core';
import { QueryEntity } from '@datorama/akita';
import { PlayerStore, PlayerState } from './player.store';
import { PlayerTrack } from './player.model';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class PlayerQuery extends QueryEntity<PlayerState, PlayerTrack> {
  constructor(protected store: PlayerStore) {
    super(store);
  }

  selectPosition(trackId: string): Observable<number> {
    return this.selectEntity(trackId, 'position');
  }

  selectPaused(trackId: string): Observable<boolean> {
    return this.selectEntity(trackId, 'paused');
  }

  getPaused(trackId: string): boolean {
    const track = this.getEntity(trackId);
    if (!track) return;
    return track.paused;
  }

  selectShuffle(): Observable<boolean> {
    return this.select((state) => state.ui.shuffle);
  }
}
