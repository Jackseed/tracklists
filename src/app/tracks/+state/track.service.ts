import { Injectable } from '@angular/core';
import { TracksStore, TrackState } from './track.store';
import { CollectionConfig, CollectionService } from 'akita-ng-fire';
import { environment } from 'src/environments/environment';
import { AuthQuery } from 'src/app/auth/+state';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { map, tap } from 'rxjs/operators';
import {
  createAudioFeatures,
  createFullTrack,
  createTrack,
} from './track.model';

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
    const likedTracks = await this.http.get(
      'https://api.spotify.com/v1/me/tracks?limit=5',
      { headers }
    );
    likedTracks
      .pipe(
        map((likedTracks) => {
          console.log(likedTracks);
          likedTracks.items.map(async (item) => {
            console.log('item: ', item);
            let track = createTrack({
              isLiked: true,
              added_at: item.added_at,
              ...item.track,
            });

            console.log('track: ', track);
            console.log(item.track);
            const audioFeatures = (await this.getAudioFeatures(track.id))
              .pipe(
                tap((audioFeatures) => {
                  console.log('audio features: ', audioFeatures);
                  const audioFeat = createAudioFeatures(audioFeatures);
                  const fullTrack = createFullTrack({
                    ...track,
                    ...audioFeat,
                  });
                  console.log('final track: ', fullTrack);
                })
              )
              .subscribe();
          });
        })
      )
      .subscribe(console.log);
    return likedTracks;
  }

  private saveTrack() {}

  private async getAudioFeatures(trackId: string) {
    const headers = await this.getHeaders();
    console.log(trackId);
    const audioAnalysis = await this.http.get(
      `https://api.spotify.com/v1/audio-features/${trackId}`,
      { headers }
    );
    audioAnalysis.subscribe(console.log);
    return audioAnalysis;
  }
}
