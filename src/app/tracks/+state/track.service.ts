import { Injectable } from '@angular/core';
import { TracksStore, TrackState } from './track.store';
import { CollectionConfig, CollectionService } from 'akita-ng-fire';
import { environment } from 'src/environments/environment';
import { AuthQuery } from 'src/app/auth/+state';
import { HttpClient, HttpHeaders } from '@angular/common/http';

@Injectable({ providedIn: 'root' })
@CollectionConfig({ path: 'tracks' })
export class TrackService extends CollectionService<TrackState> {
  authorizeURL: string = 'https://accounts.spotify.com/authorize';
  clientId: string = environment.spotify.clientId;
  baseUrl: string = environment.spotify.apiUrl;
  responseType: string = 'token';
  redirectURI: string = environment.spotify.redirectURI;

  constructor(
    store: TracksStore,
    private authQuery: AuthQuery,
    private http: HttpClient
  ) {
    super(store);
  }

  public async getPlaylist() {
    const user = await this.authQuery.getActive();
    const headers = new HttpHeaders().set(
      'Authorization',
      'Bearer ' + user.token
    );
    const response = await this.http.get(
      'https://api.spotify.com/v1/me/tracks?limit=50',
      { headers }
    );
    response.subscribe(console.log);
    return response;
  }
}
