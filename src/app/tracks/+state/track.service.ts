import { Injectable } from '@angular/core';
import { TrackStore, TrackState } from './track.store';
import { CollectionConfig, CollectionService } from 'akita-ng-fire';
import { environment } from 'src/environments/environment';
import { Track } from './track.model';
import { TrackQuery } from './track.query';
import { AuthQuery } from 'src/app/auth/+state';
import { Observable } from 'rxjs';
import { AkitaFiltersPlugin, AkitaFilter } from 'akita-filters-plugin';
import { SpotifyService } from 'src/app/spotify/spotify.service';

@Injectable({ providedIn: 'root' })
@CollectionConfig({ path: 'tracks' })
export class TrackService extends CollectionService<TrackState> {
  authorizeURL: string = 'https://accounts.spotify.com/authorize';
  clientId: string = environment.spotify.clientId;
  baseUrl: string = environment.spotify.apiUrl;
  responseType: string = 'token';
  redirectURI: string = environment.spotify.redirectURI;
  trackFilters: AkitaFiltersPlugin<TrackState>;

  constructor(
    store: TrackStore,
    private query: TrackQuery,
    private spotifyService: SpotifyService
  ) {
    super(store);
    this.trackFilters = new AkitaFiltersPlugin<TrackState>(this.query);
  }

  public async addToPlayback(trackId: string) {
    const query = await this.spotifyService.getAddToPlaybackRequest(trackId);
  }

  public async play(trackUris?: string[]) {
    trackUris
      ? await this.spotifyService.play(trackUris)
      : await this.spotifyService.play();
  }

  public async pause() {
    await this.spotifyService.pause().catch((error) => console.log(error));
  }

  public async seekPosition(position: number) {
    await this.spotifyService
      .seekPosition(position)
      .catch((error) => console.log(error));
  }

  public async playNext() {
    const query = await this.spotifyService.getPlayNextRequest();
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
    return this.trackFilters.selectAllByFilters({
      sortBy: 'id',
    });
  }
}
