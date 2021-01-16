import { Injectable } from '@angular/core';
import { TrackStore, TrackState } from './track.store';
import { Track } from './track.model';
import { TrackQuery } from './track.query';
import { Observable } from 'rxjs';
import { AkitaFiltersPlugin, AkitaFilter } from 'akita-filters-plugin';
import { filter, first, map, switchMap, tap } from 'rxjs/operators';
import { Playlist } from 'src/app/playlists/+state';

@Injectable({ providedIn: 'root' })
export class TrackService {
  trackFilters: AkitaFiltersPlugin<TrackState>;

  constructor(private store: TrackStore, private query: TrackQuery) {
    this.trackFilters = new AkitaFiltersPlugin<TrackState>(this.query);
  }

  public setFirestoreTracks() {
    // if data can be loaded from localStorage, don't call firestore
    const data = localStorage.getItem('trackStore');
    if (data) return;
    const tracks$ = this.query.getUserTracks;
    tracks$
      .pipe(
        tap((tracks) => {
          this.store.set(tracks);
          this.store.setActive([]);
        }, first())
      )
      .subscribe();
  }

  setFilter(filter: AkitaFilter<TrackState>) {
    this.trackFilters.setFilter(filter);
  }

  removeFilter(id: string) {
    this.trackFilters.removeFilter(id);
  }

  removeAllFilter() {
    this.trackFilters.clearFilters();
  }

  selectFilters(): Observable<AkitaFilter<TrackState>[]> {
    return this.trackFilters.selectFilters();
  }

  selectAll(): Observable<Track[]> {
    const activeIds$ = this.query.selectActiveId();

    const tracks$ = activeIds$.pipe(
      filter((ids) => !!ids),
      switchMap((ids) =>
        this.trackFilters.selectAllByFilters({
          // limit filtered selection to active tracks
          filterBy: (track) => ids.includes(track.id),
        })
      )
    );
    // @ts-ignore zs it was not an hashMap with not asObject
    return tracks$;
  }

  public getMore(page: number): Observable<Track[]> {
    const activeIds$ = this.query.selectActiveId();
    const perPage = 15;
    const offset = page * perPage;

    return activeIds$
      .pipe(
        switchMap((ids) =>
          this.trackFilters.selectAllByFilters({
            // limit selection to active tracks
            filterBy: (track) => ids.includes(track.id),
          })
        )
      )
      .pipe(map((tracks: Track[]) => tracks.slice(0, offset)));
  }

  public get tracksLength$() {
    return this.selectAll().pipe(
      map((tracks) => {
        return tracks.length;
      })
    );
  }

  public addActive(playlist: Playlist) {
    this.store.addActive(playlist.trackIds);
  }

  public addAllActive() {
    const tracks = this.query.getAll();
    const trackIds = tracks.map((track) => track.id);
    this.store.addActive(trackIds);
  }
  public removeActive(playlist: Playlist) {
    this.store.removeActive(playlist.trackIds);
  }

  public removeAllActive() {
    const tracks = this.query.getAll();
    const trackIds = tracks.map((track) => track.id);
    this.store.removeActive(trackIds);
  }
}
