import { Injectable } from '@angular/core';
import { TrackStore, TrackState } from './track.store';
import { CollectionConfig, CollectionService } from 'akita-ng-fire';
import { environment } from 'src/environments/environment';
import { Track } from './track.model';
import { TrackQuery } from './track.query';
import { AuthQuery } from 'src/app/auth/+state';

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
    private authQuery: AuthQuery
  ) {
    super(store);
  }

  public async saveLikedTracks() {
    const likedTracksLimit = 50;
    const audioFeaturesLimit = 100;
    const firebaseWriteLimit = 500;
    const userId = this.authQuery.getActiveId();
    console.log('user id', userId);
    const total: number = await this.query.getTotalLikedTracks();
    let tracks: Track[] = [];
    let trackIds: string[] = [];
    let audioFeatures: Track[] = [];
    let fullTracks: Track[] = [];
    const collection = this.db.firestore.collection(this.currentPath);
    const userRef = this.db.firestore.collection('users').doc(userId);

    // get all the liked tracks
    for (let j = 0; j <= Math.floor(total / likedTracksLimit) + 1; j++) {
      const offset = j * likedTracksLimit;
      const url = `https://api.spotify.com/v1/me/tracks?limit=${likedTracksLimit}&offset=${offset}`;
      const formatedTracks = await this.query.getFormatedLikedTracks(url);

      tracks = tracks.concat(formatedTracks);
    }

    trackIds = tracks.map((track) => track.id);

    // Get all the audio features from liked tracks by batches
    for (let i = 0; i <= Math.floor(total / audioFeaturesLimit); i++) {
      const bactchTrackIds = trackIds.slice(
        audioFeaturesLimit * i,
        audioFeaturesLimit * (i + 1)
      );

      const formatedFeatures = await this.query.getFormatedAudioFeatures(
        bactchTrackIds
      );
      audioFeatures = audioFeatures.concat(formatedFeatures);
    }
    console.log('tracks: ', tracks, 'audio features: ', audioFeatures);

    fullTracks = tracks.map((item, i) =>
      Object.assign({}, item, audioFeatures[i])
    );
    console.log(fullTracks);
    console.log(trackIds);
    // write the tracks by batches
    for (let i = 0; i <= Math.floor(total / firebaseWriteLimit); i++) {
      const bactchFullTracks = fullTracks.slice(
        firebaseWriteLimit * i,
        firebaseWriteLimit * (i + 1)
      );
      const batch = this.db.firestore.batch();

      for (const track of bactchFullTracks) {
        const ref = collection.doc(track.id);
        batch.set(ref, track);
      }

      batch
        .commit()
        .then((_) => console.log(`batch of tracks ${i} saved`))
        .catch((error) => console.log(error));
    }

    userRef
      .update({ likedTracksIds: trackIds })
      .then((_) => console.log('trackIds saved on user'))
      .catch((error) => console.log(error));
  }
}
