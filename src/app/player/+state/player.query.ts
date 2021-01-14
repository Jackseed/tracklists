import { Injectable } from '@angular/core';
import { QueryEntity } from '@datorama/akita';
import { PlayerStore, PlayerState } from './player.store';
import { PlayerTrack } from './player.model';

@Injectable({
  providedIn: 'root',
})
export class PlayerQuery extends QueryEntity<PlayerState, PlayerTrack> {
  constructor(protected store: PlayerStore) {
    super(store);
  }
}
