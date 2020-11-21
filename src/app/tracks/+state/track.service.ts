import { Injectable } from '@angular/core';
import { TracksStore, TrackState } from './track.store';
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
    store: TracksStore,
    private query: TrackQuery,
    private authService: AuthService
  ) {
    super(store);
  }

  public async saveLikedTracks() {
    const likedTracks = await this.query.getLikedTracks();
    likedTracks.subscribe(console.log);
    likedTracks
      .pipe(
        map((tracks) =>
          tracks.map((track) => {
            console.log(track);
            this.saveTrack(track);
            this.authService.addLikedTrack(track.track.id);
          })
        ),
        first()
      )
      .subscribe();
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
