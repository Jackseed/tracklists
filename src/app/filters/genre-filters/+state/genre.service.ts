import { Injectable, inject } from '@angular/core';
import { combineLatest, Observable } from 'rxjs';
import { auditTime, distinctUntilChanged, map } from 'rxjs/operators';
import { Track, TrackQuery, TrackService } from '../../../tracks/+state';
import { Genre } from './genre.model';
import { GenreQuery } from './genre.query';
import { GenreStore } from './genre.store';

/** Groups the tracks by genre: genre -> ids of the tracks having it. */
export function genresOf(tracks: Track[]): Genre[] {
  const byGenre = new Map<string, string[]>();
  for (const track of tracks) {
    for (const genre of track.genres ?? []) {
      const trackIds = byGenre.get(genre);
      if (trackIds) trackIds.push(track.id);
      else byGenre.set(genre, [track.id]);
    }
  }
  return [...byGenre].map(([id, trackIds]) => ({ id, trackIds }));
}

/**
 * Genres of the selected tracks, and the genre filter.
 *
 * Genres are derived from the tracks already in memory (each track carries the
 * genres of its artist): selecting hundreds of playlists costs no request.
 */
@Injectable({ providedIn: 'root' })
export class GenreService {
  private store = inject(GenreStore);
  private query = inject(GenreQuery);
  private trackQuery = inject(TrackQuery);
  private trackService = inject(TrackService);

  constructor() {
    // The service lives as long as the app: no need to unsubscribe.
    (this.trackQuery.selectActive() as unknown as Observable<Track[]>)
      .pipe(auditTime(0))
      .subscribe((tracks) => this.store.set(genresOf(tracks ?? [])));

    // Tracks are filtered by the selected genres; a genre that disappears with its
    // playlist stops filtering.
    combineLatest([this.query.selectActiveId(), this.query.selectAll()])
      .pipe(
        map(([activeIds, genres]) => {
          const active = new Set((activeIds ?? []) as string[]);
          return genres.filter((genre) => active.has(genre.id));
        }),
        distinctUntilChanged((a, b) => a.length === b.length && a.every((genre, i) => genre === b[i]))
      )
      .subscribe((genres) => {
        if (genres.length === 0) return this.trackService.removeFilter('genres');
        const trackIds = new Set(genres.flatMap((genre) => genre.trackIds));
        this.trackService.setFilter({ id: 'genres', predicate: (track) => trackIds.has(track.id) });
      });
  }

  public addActive(genreId: string) {
    this.store.addActive(genreId);
  }

  public removeActive(genreId: string) {
    this.store.removeActive(genreId);
  }
}
