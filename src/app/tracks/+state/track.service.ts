import { Injectable } from '@angular/core';
import { TrackStore, TrackState } from './track.store';
import { TrackQuery } from './track.query';
import { Observable } from 'rxjs';
import { AkitaFiltersPlugin, AkitaFilter } from 'akita-filters-plugin';
import { filter, first, map, switchMap, tap } from 'rxjs/operators';
import { Track } from './track.model';

@Injectable({ providedIn: 'root' })
export class TrackService {
  private trackFilters: AkitaFiltersPlugin<TrackState>;

  constructor(private store: TrackStore, private query: TrackQuery) {
    this.trackFilters = new AkitaFiltersPlugin<TrackState>(this.query);
  }

  public setFirestoreTracks() {
    // if data can be loaded from localStorage, don't call firestore
    const data = localStorage.getItem('trackStore');
    // if storage data, loads it
    if (data && !data.includes(':{}')) {
      this.store.loadFromStorage();
    } else {
      this.loadFromFirebase();
    }
  }

  public loadFromFirebase() {
    this.query.selectUserTracks$
      .pipe(
        tap((tracks) => {
          tracks ? this.store.set(tracks) : this.store.set({});
          this.store.setActive([]);
        }, first())
      )
      .subscribe();
  }

  selectFilteredTracks(): Observable<Track[]> {
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
    return this.selectFilteredTracks().pipe(
      map((tracks) => {
        return tracks.length;
      })
    );
  }

  public selectReleaseYears(): Observable<number[]> {
    return this.selectFilteredTracks().pipe(
      map((tracks) =>
        tracks.map((track) => parseFloat(track.album.release_date.slice(0, 4)))
      )
    );
  }

  public selectTempo(): Observable<number[]> {
    return this.selectFilteredTracks().pipe(
      map((tracks) => tracks.map((track) => track.tempo))
    );
  }

  getFilters(): AkitaFilter<TrackState>[] {
    return this.trackFilters.getFilters();
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

  public add(tracks: Track[]) {
    this.store.add(tracks);
  }

  public addActive(trackIds: string[]) {
    this.store.addActive(trackIds);
  }

  public addAllActive() {
    const tracks = this.query.getAll();
    const trackIds = tracks.map((track) => track.id);
    this.store.addActive(trackIds);
  }
  public removeActive(trackIds: string[]) {
    this.store.removeActive(trackIds);
  }

  public removeAllActive() {
    const tracks = this.query.getAll();
    const trackIds = tracks.map((track) => track.id);
    this.store.removeActive(trackIds);
  }

  public updateSpinner(spinner: boolean) {
    this.store.update({ ui: { spinner, loadingItem: '' } });
  }

  public updateLoadingItem(loadingItem: string) {
    this.store.update({ ui: { spinner: true, loadingItem } });
  }
}
