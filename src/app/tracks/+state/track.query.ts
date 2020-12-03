import { Injectable } from '@angular/core';
import { EntityUIQuery, QueryEntity } from '@datorama/akita';
import { TrackStore, TrackState, TrackUIState } from './track.store';
import { AuthQuery } from 'src/app/auth/+state';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import {
  delayWhen,
  filter,
  first,
  map,
  retryWhen,
  take,
  tap,
} from 'rxjs/operators';
import { Observable, timer } from 'rxjs';
import {
  createAudioFeatures,
  createTrack,
  SpotifyAudioFeatures,
  SpotifyPaging,
  SpotifyPlaylistTrack,
  SpotifySavedTrack,
  SpotifyTrack,
  Track,
} from './track.model';

@Injectable({ providedIn: 'root' })
export class TrackQuery extends QueryEntity<TrackState> {
  ui: EntityUIQuery<TrackUIState>;

  constructor(
    protected store: TrackStore,
    private authQuery: AuthQuery,
    private http: HttpClient
  ) {
    super(store);
    this.createUIQuery();
  }

  selectPosition(trackId: string): Observable<number> {
    return this.ui.selectEntity(trackId, 'position');
  }

  selectPaused(trackId: string): Observable<boolean> {
    return this.ui.selectEntity(trackId, 'paused');
  }

  getPaused(trackId: string): boolean {
    return this.ui.getEntity(trackId).paused;
  }

  private async getHeaders() {
    const user = await this.authQuery.getActive();
    const headers = new HttpHeaders().set(
      'Authorization',
      'Bearer ' + user.token
    );
    return headers;
  }

  public async getPromisedLikedTracks(
    url: string
  ): Promise<Observable<SpotifyPaging>> {
    const headers = await this.getHeaders();

    const likedTracks: Observable<SpotifyPaging> = this.http
      .get<SpotifyPaging>(`${url}`, {
        headers,
      })
      .pipe(
        retryWhen((error) => {
          return error.pipe(
            tap((error) => console.log('error status: ', error.status)),
            filter((error) => error.status === 429),
            delayWhen(() => timer(5000)),
            tap(() => console.log('retrying...')),
            take(3)
          );
        })
      );

    return likedTracks;
  }

  public async getLikedTracks(url: string): Promise<SpotifyPaging> {
    return await (await this.getPromisedLikedTracks(url))
      .pipe(first())
      .toPromise();
  }

  public async getTotalLikedTracks(): Promise<number> {
    const url = 'https://api.spotify.com/v1/me/tracks?limit=1';
    const tracks = await this.getLikedTracks(url);
    return tracks.total;
  }

  public async getFormatedLikedTracks(url: string): Promise<Track[]> {
    return await (await this.getPromisedLikedTracks(url))
      .pipe(
        map((tracks) =>
          tracks.items.map((item: SpotifySavedTrack) =>
            // TODO: remove added_at from track
            createTrack({
              added_at: item.added_at,
              ...item.track,
            })
          )
        ),
        first()
      )
      .toPromise();
  }
  // TODO: merge get playlist tracks & get liked tracks
  public async getPromisedPlaylistTracks(
    url: string
  ): Promise<Observable<SpotifyPaging>> {
    const headers = await this.getHeaders();

    const playlistTracks: Observable<SpotifyPaging> = this.http
      .get<SpotifyPaging>(`${url}`, {
        headers,
      })
      .pipe(
        retryWhen((error) => {
          return error.pipe(
            tap((error) => console.log('error status: ', error.status)),
            filter((error) => error.status === 429),
            delayWhen(() => timer(5000)),
            tap(() => console.log('retrying...')),
            take(3)
          );
        })
      );
    playlistTracks.subscribe(console.log);
    return playlistTracks;
  }

  public async getFormatedPlaylistTracks(url: string): Promise<Track[]> {
    return await (await this.getPromisedPlaylistTracks(url))
      .pipe(
        tap((_) => console.log),
        map((playlistTracks) =>
          playlistTracks.items.map((item: SpotifyPlaylistTrack) =>
            // TODO: remove added_at from track
            createTrack({
              added_at: item.added_at,
              added_by: item.added_by,
              ...item.track,
            })
          )
        ),
        first()
      )
      .toPromise();
  }

  public async getPromisedManyAudioFeatures(trackIds: string[]) {
    const headers = await this.getHeaders();

    let queryParam: string = '?ids=';
    for (const trackId of trackIds) {
      queryParam = queryParam + trackId + ',';
    }

    const url = 'https://api.spotify.com/v1/audio-features/' + queryParam;
    const audioAnalysis = this.http
      .get<{ audio_features: SpotifyAudioFeatures[] }>(`${url}`, { headers })
      .pipe(
        retryWhen((error) => {
          return error.pipe(
            tap((error) => console.log('error status: ', error.status)),
            filter((error) => error.status === 429),
            delayWhen(() => timer(5000)),
            tap(() => console.log('retrying...')),
            take(3)
          );
        })
      );

    return audioAnalysis;
  }

  public async getFormatedAudioFeatures(trackIds: string[]): Promise<Track[]> {
    return await (await this.getPromisedManyAudioFeatures(trackIds))
      .pipe(
        map((audioFeat) =>
          audioFeat.audio_features.map((feature) =>
            createAudioFeatures(feature)
          )
        ),
        first()
      )
      .toPromise();
  }

  public async getAddToPlaybackRequest(trackUri: string) {
    const headers = await this.getHeaders();
    const baseUrl = 'https://api.spotify.com/v1/me/player/queue';
    const queryParam = `?uri=${trackUri}`;
    const url = baseUrl + queryParam;

    return this.http
      .post(`${url}`, null, {
        headers,
      })
      .pipe(first())
      .toPromise();
  }

  public async getPlayNextRequest() {
    const headers = await this.getHeaders();
    const baseUrl = 'https://api.spotify.com/v1/me/player/next';

    return this.http
      .post(`${baseUrl}`, null, {
        headers,
      })
      .pipe(first())
      .toPromise();
  }

  public async play(trackUris?: string[]) {
    const user = this.authQuery.getActive();
    const headers = await this.getHeaders();
    const baseUrl = 'https://api.spotify.com/v1/me/player/play';
    const body = trackUris
      ? {
          uris: trackUris,
        }
      : null;

    const queryParam =
      user.deviceId && trackUris ? `?device_id=${user.deviceId}` : '';

    return this.http
      .put(`${baseUrl + queryParam}`, body, {
        headers,
      })
      .pipe(first())
      .toPromise();
  }

  public async pause() {
    const headers = await this.getHeaders();
    const baseUrl = 'https://api.spotify.com/v1/me/player/pause';

    return this.http
      .put(`${baseUrl}`, null, {
        headers,
      })
      .pipe(first())
      .toPromise();
  }

  public async seekPosition(position_ms: number) {
    const headers = await this.getHeaders();
    const baseUrl = 'https://api.spotify.com/v1/me/player/seek';
    const queryParam = `?position_ms=${position_ms}`;

    return this.http
      .put(`${baseUrl + queryParam}`, null, {
        headers,
      })
      .pipe(first())
      .toPromise();
  }
}
