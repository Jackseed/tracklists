import { Injectable } from '@angular/core';
import { EntityState, EntityStore, MultiActiveState, StoreConfig } from '@datorama/akita';
import { Track } from './track.model';

export interface TrackState extends EntityState<Track, string>, MultiActiveState {
  ui: {
    /** The library is being read from the cache or from Firestore. */
    loading: boolean;
    /** Tracks read so far while loading from Firestore. */
    loaded: number;
    /** Set when the library could not be loaded. */
    error: string | null;
  };
}

const initialState = {
  active: [],
  ui: { loading: true, loaded: 0, error: null },
};

@Injectable({ providedIn: 'root' })
@StoreConfig({ name: 'tracks', resettable: true })
export class TrackStore extends EntityStore<TrackState, Track> {
  constructor() {
    super(initialState);
  }
}
