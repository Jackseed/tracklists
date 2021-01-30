import { Injectable } from '@angular/core';
import { TrackStore, TrackState } from './track.store';
import { TrackQuery } from './track.query';
import { Observable } from 'rxjs';
import { AkitaFiltersPlugin, AkitaFilter } from 'akita-filters-plugin';
import { first, tap } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class TrackService {
  trackFilters: AkitaFiltersPlugin<TrackState>;

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
      const tracks$ = this.query.selectUserTracks$;
      tracks$
        .pipe(
          tap((tracks) => {
            tracks ? this.store.set(tracks) : this.store.set({});
            this.store.setActive([]);
          }, first())
        )
        .subscribe();
    }
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
