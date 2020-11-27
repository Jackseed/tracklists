import { Injectable } from '@angular/core';
import { QueryEntity } from '@datorama/akita';
import { TrackStore, TrackState } from './track.store';
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
import { timer } from 'rxjs';
import { createAudioFeatures, createTrack, Track } from './track.model';

@Injectable({ providedIn: 'root' })
export class TrackQuery extends QueryEntity<TrackState> {
  constructor(
    protected store: TrackStore,

    private authQuery: AuthQuery,
    private http: HttpClient
  ) {
    super(store);
  }

  private async getHeaders() {
    const user = await this.authQuery.getActive();
    const headers = new HttpHeaders().set(
      'Authorization',
      'Bearer ' + user.token
    );
    return headers;
  }

  public async getPromisedLikedTracks(url: string) {
    const headers = await this.getHeaders();

    const likedTracks = this.http
      .get(`${url}`, {
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

  public async getLikedTracks(url: string) {
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
          tracks.items.map((item) =>
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

  public async getPromisedManyAudioFeatures(trackIds: string[]) {
    const headers = await this.getHeaders();

    let queryParam: string = '?ids=';
    for (const trackId of trackIds) {
      queryParam = queryParam + trackId + ',';
    }

    const url = 'https://api.spotify.com/v1/audio-features/' + queryParam;
    const audioAnalysis = await this.http.get(`${url}`, { headers }).pipe(
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
}