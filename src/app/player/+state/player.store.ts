import { Injectable } from '@angular/core';
import {
  ActiveState,
  EntityState,
  EntityStore,
  StoreConfig,
} from '@datorama/akita';
import { PlayerTrack } from './player.model';

export interface PlayerState extends EntityState<PlayerTrack>, ActiveState {}

@Injectable({ providedIn: 'root' })
@StoreConfig({ name: 'player' })
export class PlayerStore extends EntityStore<PlayerState, PlayerTrack> {
  constructor() {
    super();
  }
}
