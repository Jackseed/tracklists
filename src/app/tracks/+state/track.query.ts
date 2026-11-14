import { Injectable } from '@angular/core';
import { QueryEntity } from '@datorama/akita';
import { Observable } from 'rxjs';
import { distinctUntilChanged, map } from 'rxjs/operators';
import { PlaylistQuery } from '../../playlists/+state/playlist.query';
import { MinMax, Track } from './track.model';
import { TrackState, TrackStore } from './track.store';

@Injectable({ providedIn: 'root' })
export class TrackQuery extends QueryEntity<TrackState, Track> {
  constructor(protected override store: TrackStore, private playlistQuery: PlaylistQuery) {
    super(store);
  }

  public isLiked$(trackId: string): Observable<boolean> {
    return this.playlistQuery.likedTrackIds$.pipe(
      map((likedIds) => likedIds.has(trackId)),
      distinctUntilChanged()
    );
  }

  public selectLibraryLoading(): Observable<TrackState['ui']> {
    return this.select((state) => state.ui);
  }

  public get getExtremeReleaseYears(): MinMax {
    return minMax(this.getAll().map((track) => track.album?.release_year));
  }

  public get getExtremeTempos(): MinMax {
    const { min, max } = minMax(this.getAll().map((track) => track.tempo));
    return { min: Math.floor(min), max: Math.ceil(max) };
  }
}

/** Smallest and largest of the truthy values (0 means "unknown" for years and tempos). */
function minMax(values: Array<number | null | undefined>): MinMax {
  let min = Infinity;
  let max = -Infinity;
  // A loop rather than Math.min(...values): spreading tens of thousands of arguments overflows the stack.
  for (const value of values) {
    if (!value) continue;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return Number.isFinite(min) ? { min, max } : { min: 0, max: 0 };
}
