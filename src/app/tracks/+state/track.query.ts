import { Injectable } from '@angular/core';
import { QueryEntity } from '@datorama/akita';
import { TrackStore, TrackState } from './track.store';
import { AuthQuery } from 'src/app/auth/+state';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { map } from 'rxjs/operators';

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

  public async getLikedTracks() {
    const headers = await this.getHeaders();
    const url = 'https://api.spotify.com/v1/me/tracks';
    const queryParams = '?limit=5';

    const likedTracks = await this.http.get(`${url + queryParams}`, {
      headers,
    });

    const likedItems = likedTracks.pipe(
      map((likedTracks) => likedTracks.items)
    );
    return likedItems;
  }

  public async getAudioFeatures(trackId: string) {
    const headers = await this.getHeaders();
    const url = 'https://api.spotify.com/v1/audio-features/';
    const audioAnalysis = await this.http.get(`${url + trackId}`, { headers });
    return audioAnalysis;
  }
}
