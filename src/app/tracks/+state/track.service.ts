import { Injectable } from '@angular/core';
import { TrackStore, TrackState } from './track.store';
import { CollectionConfig, CollectionService } from 'akita-ng-fire';
import { environment } from 'src/environments/environment';
import { createTrack, Track } from './track.model';
import { TrackQuery } from './track.query';
import { AuthQuery, AuthService } from 'src/app/auth/+state';
import { Observable } from 'rxjs';
import { AkitaFiltersPlugin, AkitaFilter } from 'akita-filters-plugin';

declare global {
  interface Window {
    onSpotifyWebPlaybackSDKReady(): void;
    // @ts-ignore: Unreachable code error
    Spotify: typeof Spotify;
  }
}

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
    private authQuery: AuthQuery,
    private authService: AuthService
  ) {
    super(store);
    this.trackFilters = new AkitaFiltersPlugin<TrackState>(this.query);
  }

  public async initializePlayer() {
    // @ts-ignore: Unreachable code error
    const { Player } = await this.waitForSpotifyWebPlaybackSDKToLoad();
    const user = await this.authQuery.getActive();
    console.log('The Web Playback SDK has loaded.', Player);

    // instantiate the player
    const player = new Player({
      name: 'Listy player',
      getOAuthToken: (callback) => {
        callback(user.token);
      },
    });

    let connected = await player.connect();

    // Ready
    player.addListener('ready', ({ device_id }) => {
      this.authService.saveDeviceId(device_id);
    });

    // when player state change, set active the track
    player.on('player_state_changed', async (state) => {
      this.store.setActive(state.track_window.current_track.id);
    });
  }

  // check if window.Spotify object has either already been defined, or check until window.onSpotifyWebPlaybackSDKReady has been fired
  public async waitForSpotifyWebPlaybackSDKToLoad() {
    return new Promise((resolve) => {
      if (window.Spotify) {
        resolve(window.Spotify);
      } else {
        window.onSpotifyWebPlaybackSDKReady = () => {
          resolve(window.Spotify);
        };
      }
    });
  }

  public async saveLikedTracks() {
    const likedTracksLimit = 50;
    const audioFeaturesLimit = 100;
    const firebaseWriteLimit = 500;
    const total: number = await this.query.getTotalLikedTracks();

    let tracks: Track[] = [];
    let trackIds: string[] = [];
    let audioFeatures: Track[] = [];
    let fullTracks: Track[] = [];

    const userId = this.authQuery.getActiveId();
    const collection = this.db.firestore.collection(this.currentPath);
    const userRef = this.db.firestore.collection('users').doc(userId);

    // get all the liked tracks by batches
    for (let j = 0; j <= Math.floor(total / likedTracksLimit) + 1; j++) {
      const offset = j * likedTracksLimit;
      const url = `https://api.spotify.com/v1/me/tracks?limit=${likedTracksLimit}&offset=${offset}`;
      const formatedTracks = await this.query.getFormatedLikedTracks(url);

      tracks = tracks.concat(formatedTracks);
    }

    trackIds = tracks.map((track) => track.id);

    // Get all the audio features by batches
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

    // concat tracks & audio features
    fullTracks = tracks.map((item, i) =>
      Object.assign({}, item, audioFeatures[i])
    );

    // TODO: verify that tracks are not written if they already exist
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

    // write liked titles in the user doc
    userRef
      .update({ likedTracksIds: trackIds })
      .then((_) => console.log('trackIds saved on user'))
      .catch((error) => console.log(error));
  }

  public async addToPlayback(trackId: string) {
    const query = await this.query.getAddToPlaybackRequest(trackId);
  }

  public async play(trackUris: string[]) {
    this.query.play(trackUris).catch((error) => console.log(error));
  }

  public async pause() {
    this.query.pause().catch((error) => console.log(error));
  }

  public async playNext() {
    const query = await this.query.getPlayNextRequest();
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
