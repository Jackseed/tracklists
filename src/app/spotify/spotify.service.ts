// Angular
import {
  HttpClient,
  HttpErrorResponse,
  HttpHeaders,
} from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Title } from '@angular/platform-browser';
// Rxjs
import { of, timer } from 'rxjs';
import {
  catchError,
  delayWhen,
  filter,
  first,
  map,
  retryWhen,
  take,
  tap,
} from 'rxjs/operators';
// Angularfire
import {
  arrayUnion,
  collection,
  CollectionReference,
  doc,
  Firestore,
  setDoc,
  Timestamp,
} from '@angular/fire/firestore';
// Akita
import { AkitaFilter } from 'akita-filters-plugin';
// States
import { AuthQuery, AuthService, Devices, User } from '../auth/+state';
import { Playlist } from '../playlists/+state';
import {
  Track,
  Artist,
  createAudioFeatures,
  SpotifyAudioFeatures,
  TrackQuery,
  SpotifyTrack,
  TrackState,
} from '../tracks/+state';
import { PlayerService } from '../player/+state/player.service';
import { PlayerQuery } from '../player/+state';

declare global {
  interface Window {
    onSpotifyWebPlaybackSDKReady(): void;
    // @ts-ignore: Unreachable code error
    Spotify: typeof Spotify;
  }
}

@Injectable({
  providedIn: 'root',
})
export class SpotifyService {
  constructor(
    private firestore: Firestore,
    private authQuery: AuthQuery,
    private authService: AuthService,
    private playerQuery: PlayerQuery,
    private playerService: PlayerService,
    private trackQuery: TrackQuery,
    private http: HttpClient,
    private title: Title
  ) {}

  public async initializePlayer(trackUris?: string[]) {
    // @ts-ignore: Unreachable code error
    const { Player } = await this.waitForSpotifyWebPlaybackSDKToLoad();

    // Instantiates Spotify player.
    const player = new Player({
      name: 'Tracklists',
      getOAuthToken: async (callback: any) => {
        const token = (await this.authService.getToken()).token;

        callback(token);
      },
    });

    player.connect();

    // Sets device id
    player.addListener('ready', async ({ device_id }) => {
      this.authService.saveDeviceId(device_id);

      if (trackUris) this.play(trackUris, device_id);
    });

    // When player state changes, sets active the track.
    player.on('player_state_changed', async (state) => {
      if (!state) return;

      // gets it from db as there has been some errors
      let dbTrack = this.trackQuery.getEntity(
        state.track_window.current_track.id
      );
      // prevents error due to Track Relinking
      if (!dbTrack)
        dbTrack = this.trackQuery.getEntity(
          state.track_window.current_track.linked_from.id
        );

      const track = {
        ...dbTrack,
        position: state.position,
        paused: state.paused,
      };

      const pause = this.playerQuery.getPaused(track.id);

      this.playerService.add(track);
      this.playerService.setActive(track.id);
      this.playerService.updatePosition(track.id, state.position);
      this.playerService.updateShuffle(state.shuffle);
      // update playing track with state paused
      state.paused === pause
        ? false
        : this.playerService.updatePaused(track.id, state.paused);

      state.paused
        ? this.title.setTitle('Tracklists')
        : this.title.setTitle(`${track.name} - ${track.artists[0].name}`);
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

  //--------------------------------
  //        RECOMMENDATIONS       //
  //--------------------------------
  public async getPromisedRecommendations(
    artistIds: string[],
    genreIds: string[],
    trackIds: string[],
    filters: AkitaFilter<TrackState>[]
  ): Promise<Track[]> {
    const url = 'https://api.spotify.com/v1/recommendations';
    const limit = 100;
    let queryParam: string = `?limit=${limit}`;

    if (artistIds.length > 0) {
      queryParam = queryParam + '&seed_artists=';
      for (const artistId of artistIds) {
        queryParam = queryParam + artistId + ',';
      }
      queryParam = queryParam.substring(0, queryParam.length - 1);
    }

    if (genreIds.length > 0) {
      queryParam = queryParam + '&seed_genres=';
      for (const genreId of genreIds) {
        queryParam = queryParam + genreId + ',';
      }
      queryParam = queryParam.substring(0, queryParam.length - 1);
    }

    if (trackIds.length > 0) {
      queryParam = queryParam + '&seed_tracks=';
      for (const trackId of trackIds) {
        queryParam = queryParam + trackId + ',';
      }
      queryParam = queryParam.substring(0, queryParam.length - 1);
    }

    if (filters.length > 0) {
      for (const filter of filters) {
        if (filter.id != 'genres') {
          const min = `&min_${filter.id}=${filter.value[0]}`;
          const max = `&max_${filter.id}=${filter.value[1]}`;
          let target: string;
          filter.id === 'release_year'
            ? (target = '')
            : (target = `&target_${filter.id}=${
                (filter.value[0] + filter.value[1]) / 2
              }`);
          queryParam = queryParam + min + max + target;
        }
      }
    }

    const recommended = await (
      await this.getPromisedObjects(url, queryParam)
    )
      .pipe(
        map(async (recommendedTracks: { tracks: SpotifyTrack[] }) => {
          const tracks = recommendedTracks.tracks;
          if (tracks) {
            const trackIds = tracks.map((track) => track.id);
            const audioFeatures = await this.getAudioFeatures(trackIds);
            // Get genres
            const artistIds: string[] = tracks.map(
              (track) => track.artists[0].id
            );
            const genres = await this.getGenresByBatches(artistIds);
            const fullTracks: Track[] = tracks.map((track, i) => ({
              ...track,
              ...audioFeatures[i],
              genres: genres[i],
            }));

            // write tracks by batches
            const trackCollection = collection(this.firestore, 'tracks');
            this.firestoreWriteBatches(trackCollection, fullTracks, 'tracks');

            return fullTracks;
          }
        }),
        first()
      )
      .toPromise();

    return recommended;
  }

  // Get all the artists by batches to extract genres
  private async getGenresByBatches(artistIds: string[]): Promise<string[][]> {
    const artistLimit = 50;
    let totalGenres: string[][] = [];
    for (let i = 0; i <= Math.floor(artistIds.length / artistLimit); i++) {
      const bactchArtistIds = artistIds.slice(
        artistLimit * i,
        artistLimit * (i + 1)
      );
      const artists = await this.getArtists(bactchArtistIds);
      let genres: string[][];
      if (artists) {
        genres = artists.map((artist) => (artist ? artist.genres : []));

        // handle errors by returning empty genres
      } else {
        genres = Array.from(Array(bactchArtistIds.length), () => []);
      }

      totalGenres = totalGenres.concat(genres);
    }
    return totalGenres;
  }

  public async getAudioFeatures(trackIds: string[]): Promise<Track[]> {
    const url = 'https://api.spotify.com/v1/audio-features/';
    let queryParam: string = '?ids=';
    // add all the trackIds
    for (const trackId of trackIds) {
      queryParam = queryParam + trackId + ',';
    }
    // remove last comma
    queryParam = queryParam.substring(0, queryParam.length - 1);
    return await (
      await this.getPromisedObjects(url, queryParam)
    )
      .pipe(
        map((audioFeat: { audio_features: SpotifyAudioFeatures[] }) =>
          audioFeat.audio_features.map((feature) => {
            if (feature === null) {
              return;
            }
            return createAudioFeatures(feature);
          })
        ),
        first()
      )
      .toPromise();
  }

  public async getArtists(artistIds: string[]): Promise<Artist[]> {
    const url = 'https://api.spotify.com/v1/artists';
    let queryParam: string = '?ids=';
    for (const artistId of artistIds) {
      // handle empty artist
      if (artistId !== '') queryParam = queryParam + artistId + ',';
    }
    queryParam = queryParam.substring(0, queryParam.length - 1);

    return await (
      await this.getPromisedObjects(url, queryParam)
    )
      .pipe(
        map((artists: { artists: Artist[] }) => {
          return artists.artists;
        }),
        first()
      )
      .toPromise();
  }

  //--------------------------------
  //             PLAYER           //
  //--------------------------------

  public async getCurrentPlayback(): Promise<any> {
    const url = 'https://api.spotify.com/v1/me/player';
    const queryParam = '';

    const currentPlayback = await (
      await this.getPromisedObjects(url, queryParam)
    )
      .pipe(first())
      .toPromise();

    console.log(currentPlayback);

    return currentPlayback;
  }

  public async addToPlayback(trackUri: string) {
    const baseUrl = 'https://api.spotify.com/v1/me/player/queue';
    const queryParam = `?uri=${trackUri}`;

    return this.postRequests(baseUrl, queryParam, null);
  }

  public async previous() {
    const baseUrl = 'https://api.spotify.com/v1/me/player/previous';

    return this.postRequests(baseUrl, '', null);
  }

  public async next() {
    const baseUrl = 'https://api.spotify.com/v1/me/player/next';

    return this.postRequests(baseUrl, '', null);
  }

  public async play(trackUris?: string[], newDeviceId?: string): Promise<void> {
    let deviceId = newDeviceId ? newDeviceId : '';

    // Verifies user device if no new device id is attached.
    if (!newDeviceId) {
      let user = this.authQuery.getActive();
      deviceId = user.deviceId;

      // Verifies that deviceId is still valid, otherwise updates it and relaunches play.
      const deviceExists = await this.isDeviceExisting(user);
      if (!deviceExists) {
        await this.initializePlayer(trackUris);
        return;
      }
    }
    // Prepares and sends play request.
    trackUris = this.limitTrackAmount(trackUris);
    const baseUrl = 'https://api.spotify.com/v1/me/player/play';
    const body = { uris: trackUris };
    const queryParam = `?device_id=${deviceId}`;

    this.putRequests(baseUrl, queryParam, body);
  }

  private limitTrackAmount(trackUris?: string[]): string[] {
    // Not documented by Spotify but it looks like there is a limit around 700 tracks.
    const urisLimit = 700;
    if (trackUris?.length > urisLimit)
      trackUris = trackUris.slice(0, urisLimit - 1);
    return trackUris;
  }

  private async isDeviceExisting(user: User): Promise<boolean> {
    const devices = await this.userAvailableDevices();

    let deviceExists = false;
    devices.devices.forEach((device) => {
      if (user.deviceId === device.id) deviceExists = true;
    });

    return deviceExists;
  }

  private async userAvailableDevices(): Promise<Devices> {
    const headers = await this.getHeaders();
    const url = 'https://api.spotify.com/v1/me/player/devices';
    return this.http
      .get(url, { headers })
      .pipe(first())
      .toPromise() as Promise<Devices>;
  }

  public async pause() {
    const baseUrl = 'https://api.spotify.com/v1/me/player/pause';

    return this.putRequests(baseUrl, '', null);
  }

  public async shuffle(state: boolean) {
    const user = this.authQuery.getActive();
    const baseUrl = 'https://api.spotify.com/v1/me/player/shuffle';
    const queryParam = `?state=${state}`;

    return this.putRequests(baseUrl, queryParam, null);
  }

  public async seekPosition(position_ms: number) {
    const baseUrl = 'https://api.spotify.com/v1/me/player/seek';
    const queryParam = `?position_ms=${position_ms}`;

    return this.putRequests(baseUrl, queryParam, null);
  }

  public async addToLikedTracks(trackId: string) {
    const baseUrl = 'https://api.spotify.com/v1/me/tracks';
    const queryParam = `?ids=${trackId}`;

    return this.putRequests(baseUrl, queryParam, null);
  }

  public async removeFromLikedTracks(trackId: string) {
    const baseUrl = 'https://api.spotify.com/v1/me/tracks';
    const queryParam = `?ids=${trackId}`;

    return this.deleteRequests(baseUrl, queryParam, null);
  }

  //--------------------------------
  //           PLAYLISTS          //
  //--------------------------------

  public async getActiveUserPlaylists(): Promise<Playlist[]> {
    const user = this.authQuery.getActive();
    const url = `https://api.spotify.com/v1/users/${user.uid}/playlists`;
    return await (
      await this.getPromisedObjects(url, '?limit=50')
    )
      .pipe(
        map((paging: { items: Playlist[] }) => paging.items),
        first()
      )
      .toPromise();
  }

  public async createPlaylist(name: string) {
    const user = this.authQuery.getActive();
    const baseUrl = `https://api.spotify.com/v1/users/${user.uid}/playlists`;
    const body = { name };

    return this.postRequests(baseUrl, '', body);
  }

  public async addTracksToPlaylistByBatches(
    playlistId: string,
    tracks: Track[]
  ) {
    const limit = 100;

    // add tracks by batches
    for (let i = 0; i <= Math.floor(tracks.length / limit); i++) {
      const bactchTracks = tracks.slice(limit * i, limit * (i + 1));
      console.log('batch ', i, bactchTracks);
      this.addTracksToPlaylist(playlistId, bactchTracks);
    }
  }

  private async addTracksToPlaylist(playlistId: string, tracks: Track[]) {
    const uris = tracks.map((track) => track.uri);
    const baseUrl = `https://api.spotify.com/v1/playlists/${playlistId}/tracks`;
    const body = { uris };

    return this.postRequests(baseUrl, '', body);
  }

  private async postRequests(baseUrl: string, queryParam: string, body) {
    const headers = await this.getHeaders();

    return this.http
      .post(`${baseUrl + queryParam}`, body, {
        headers,
      })
      .pipe(first())
      .toPromise();
  }

  //--------------------------------
  //             USER             //
  //--------------------------------

  public async getActiveUserTopTracks(): Promise<Track[]> {
    const url = `https://api.spotify.com/v1/me/top/tracks`;
    return await (
      await this.getPromisedObjects(url, '?limit=50&time_range=long_term')
    )
      .pipe(
        map((paging: { items: Track[] }) => paging.items),
        first()
      )
      .toPromise();
  }

  //--------------------------------
  //          HTTP CALLS          //
  //--------------------------------

  private async firestoreWriteBatches(
    collection: CollectionReference,
    objects,
    type: string
  ) {
    // let firebaseWriteLimit: number;
    const userId = this.authQuery.getActiveId();
    await Promise.all(
      objects.map((object) => {
        const objectDoc = doc(this.firestore, `${collection}/${object.id}`);
        type === 'tracks'
          ? setDoc(
              objectDoc,
              { ...object, userIds: arrayUnion(userId) },
              { merge: true }
            )
          : setDoc(objectDoc, object, { merge: true });
      })
    );
  }

  private async getHeaders(): Promise<HttpHeaders> {
    const user = this.authQuery.getActive();
    let token = user.tokens.access;
    const isTokenValid = await this.isTokenStillValid();

    if (!isTokenValid) token = (await this.authService.getToken()).token;

    const headers = new HttpHeaders().set('Authorization', 'Bearer ' + token);

    return headers;
  }

  private async isTokenStillValid(): Promise<boolean> {
    const user = this.authQuery.getActive();
    let isTokenStillValid: boolean;

    const tokenCreationTime =
      (Timestamp.now().toMillis() - user.tokens.addedTime.toMillis()) / 1000;

    tokenCreationTime > 3600
      ? (isTokenStillValid = false)
      : (isTokenStillValid = true);

    return isTokenStillValid;
  }

  public async getPromisedObjects(url: string, queryParam: string) {
    const headers = await this.getHeaders();

    return this.http.get(`${url + queryParam}`, { headers }).pipe(
      retryWhen((error) => {
        return error.pipe(
          tap((error) => console.log('error: ', error)),
          map((error) => {
            if (error.status === 400) {
              throw error;
            } else {
              return error;
            }
          }),
          filter((error) => error.status === 429),
          delayWhen(() => timer(5000)),
          tap(() => console.log('retrying...')),
          take(3)
        );
      }),
      catchError((err: HttpErrorResponse) => {
        if (err.status === 400) {
          return of([{}]);
        }
      })
    );
  }

  private async putRequests(baseUrl: string, queryParam: string, body) {
    const headers = await this.getHeaders();

    return this.http
      .put(`${baseUrl + queryParam}`, body, {
        headers,
      })
      .pipe(first())
      .toPromise();
  }

  private async deleteRequests(baseUrl: string, queryParam: string, body) {
    const headers = await this.getHeaders();

    return this.http
      .delete(`${baseUrl + queryParam}`, {
        headers,
        observe: body,
      })
      .pipe(first())
      .toPromise();
  }
}
