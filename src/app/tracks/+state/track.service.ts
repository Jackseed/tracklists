import { Injectable } from '@angular/core';
import { TrackStore, TrackState } from './track.store';
import { CollectionConfig, CollectionService } from 'akita-ng-fire';
import { Track } from './track.model';
import { TrackQuery } from './track.query';
import { Observable } from 'rxjs';
import { AkitaFiltersPlugin, AkitaFilter } from 'akita-filters-plugin';
import { map } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
@CollectionConfig({ path: 'tracks' })
export class TrackService extends CollectionService<TrackState> {
  trackFilters: AkitaFiltersPlugin<TrackState>;

  constructor(store: TrackStore, private query: TrackQuery) {
    super(store);
    this.trackFilters = new AkitaFiltersPlugin<TrackState>(this.query);
  }

  public updatePosition(trackId: string, position: number) {
    this.store.ui.upsert(trackId, { position });
  }

  public updatePaused(trackId: string, paused: boolean) {
    this.store.ui.upsert(trackId, { paused });
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
    // @ts-ignore zs it was not an hashMap with not asObject
    return this.trackFilters.selectAllByFilters();
  }

  public getMore(page: number): Observable<Track[]> {
    const perPage = 15;
    const offset = page * perPage;

    return this.trackFilters
      .selectAllByFilters()
      .pipe(map((tracks: Track[]) => tracks.slice(0, offset)));
  }

  public get tracksLength$() {
    return this.selectAll().pipe(map((tracks) => tracks.length));
  }
}
