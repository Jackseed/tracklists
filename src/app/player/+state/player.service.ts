import { Injectable } from '@angular/core';
import { PlayerTrack } from './player.model';
import { PlayerStore } from './player.store';

@Injectable({ providedIn: 'root' })
export class PlayerService {
  constructor(private store: PlayerStore) {}

  public add(track: PlayerTrack) {
    this.store.add(track);
  }
  public setActive(trackId: string) {
    this.store.setActive(trackId);
  }

  public updatePosition(trackId: string, position: number) {
    this.store.upsert(trackId, { position });
  }

  public updatePaused(trackId: string, paused: boolean) {
    this.store.upsert(trackId, { paused });
  }
}
