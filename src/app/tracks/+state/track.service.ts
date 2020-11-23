import { Injectable } from '@angular/core';
import { TrackStore, TrackState } from './track.store';
import { CollectionConfig, CollectionService } from 'akita-ng-fire';
import { environment } from 'src/environments/environment';
import { first, map, tap } from 'rxjs/operators';
import {
  createAudioFeatures,
  createFullTrack,
  createTrack,
} from './track.model';
import { TrackQuery } from './track.query';
import { AuthService } from 'src/app/auth/+state';

@Injectable({ providedIn: 'root' })
@CollectionConfig({ path: 'tracks' })
export class TrackService extends CollectionService<TrackState> {
  authorizeURL: string = 'https://accounts.spotify.com/authorize';
  clientId: string = environment.spotify.clientId;
  baseUrl: string = environment.spotify.apiUrl;
  responseType: string = 'token';
  redirectURI: string = environment.spotify.redirectURI;

  constructor(
    store: TrackStore,
    private query: TrackQuery,
    private authService: AuthService
  ) {
    super(store);
  }

  public async saveLikedTracks(url?: string) {
    const baseUrl = url ? url : 'https://api.spotify.com/v1/me/tracks?limit=50';
    const likedTracks = await this.query.getLikedTracks(baseUrl);

    likedTracks
      .pipe(
        map((likedTracks) => {
          likedTracks.items.map(
            (item) =>
              // TODO: remove added_at from track
              createTrack({
                added_at: item.added_at,
                ...item.track,
              })
            // await this.saveTrack(item);
            // this.authService.addLikedTrack(item.track.id);
          );
          // setTimeout(() => {
          console.log(likedTracks);
          likedTracks.next ? this.saveLikedTracks(likedTracks.next) : false;
          // }, 5000);
        }),
        // https://stackoverflow.com/questions/44292270/angular-4-get-headers-from-api-response
        // https://www.learnrxjs.io/learn-rxjs/operators/error_handling/retrywhen
        first()
      )
      .subscribe(console.log);
  }

  public async saveTrack(trackItem) {
    let track = createTrack({
      added_at: trackItem.added_at,
      ...trackItem.track,
    });

    const audioFeatures = await this.query.getAudioFeatures(track.id);

    audioFeatures
      .pipe(
        tap((audioFeatures) => {
          const audioFeat = createAudioFeatures(audioFeatures);
          const fullTrack = createFullTrack({
            ...track,
            ...audioFeat,
          });
          this.db.collection(this.currentPath).doc(fullTrack.id).set(fullTrack);
        }),
        first()
      )
      .subscribe();
  }
}
