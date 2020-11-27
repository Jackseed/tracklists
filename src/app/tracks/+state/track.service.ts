import { Injectable } from '@angular/core';
import { TrackStore, TrackState } from './track.store';
import { CollectionConfig, CollectionService } from 'akita-ng-fire';
import { environment } from 'src/environments/environment';
import { Track } from './track.model';
import { TrackQuery } from './track.query';

@Injectable({ providedIn: 'root' })
@CollectionConfig({ path: 'tracks' })
export class TrackService extends CollectionService<TrackState> {
  authorizeURL: string = 'https://accounts.spotify.com/authorize';
  clientId: string = environment.spotify.clientId;
  baseUrl: string = environment.spotify.apiUrl;
  responseType: string = 'token';
  redirectURI: string = environment.spotify.redirectURI;

  constructor(store: TrackStore, private query: TrackQuery) {
    super(store);
  }

  public async saveLikedTracks() {
    let limit = 50;
    const total: number = await this.query.getTotalLikedTracks();
    let tracks: Track[] = [];
    let trackIds: string[] = [];
    let audioFeatures: Track[] = [];
    const fullTracks: Track[] = [];

    // get all the liked tracks
    for (let j = 0; j <= Math.floor(total / limit) + 1; j++) {
      const offset = j * limit;
      const url = `https://api.spotify.com/v1/me/tracks?limit=${limit}&offset=${offset}`;
      const formatedTracks = await this.query.getFormatedLikedTracks(url);

      tracks = tracks.concat(formatedTracks);
    }

    trackIds = tracks.map((track) => track.id);

    // Get all the audio features from liked tracks by batches
    for (let i = 0; i <= Math.floor(trackIds.length / 100); i++) {
      const bactchTrackIds = trackIds.slice(0 + 100 * i, 100 * (i + 1));

      const formatedFeatures = await this.query.getFormatedAudioFeatures(
        bactchTrackIds
      );
      audioFeatures = audioFeatures.concat(formatedFeatures);
    }
    console.log('tracks: ', tracks, 'audio features: ', audioFeatures);
  }
}
