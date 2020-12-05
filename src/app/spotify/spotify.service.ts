import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { timer } from 'rxjs';
import {
  delayWhen,
  filter,
  first,
  map,
  retryWhen,
  take,
  tap,
} from 'rxjs/operators';
import firebase, { firestore } from 'firebase';
import { AuthQuery, AuthService } from '../auth/+state';
import { Playlist, PlaylistQuery } from '../playlists/+state';
import { TrackStore } from '../tracks/+state/track.store';
import { TrackQuery } from '../tracks/+state/track.query';
import {
  Track,
  Artist,
  createAudioFeatures,
  createTrack,
  SpotifyAudioFeatures,
  SpotifyPlaylistTrack,
  SpotifySavedTrack,
} from '../tracks/+state/track.model';
import { TrackService } from '../tracks/+state';
import { query } from '@angular/animations';

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
  db = firebase.firestore();

  constructor(
    private authQuery: AuthQuery,
    private authService: AuthService,
    private trackStore: TrackStore,
    private trackQuery: TrackQuery,
    private trackService: TrackService,
    private playlistQuery: PlaylistQuery,
    private http: HttpClient
  ) {}

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
      const track = state.track_window.current_track;
      const pause = this.trackQuery.getPaused(track.id);
      this.trackStore.setActive(track.id);
      this.trackService.updatePosition(track.id, state.position);
      state.paused === pause
        ? false
        : this.trackService.updatePaused(track.id, state.paused);
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
    const artistLimit = 50;
    const total: number = await this.getTotalLikedTracks();

    let tracks: Track[] = [];
    let trackIds: string[] = [];
    let audioFeatures: Track[] = [];
    let fullTracks: Track[] = [];
    let artistIds: string[];
    let totalGenres: string[][] = [[]];

    const userId = this.authQuery.getActiveId();
    const trackCollection = this.db.collection('tracks');
    const userRef = this.db.collection('users').doc(userId);

    // get all the liked tracks by batches
    for (let j = 0; j <= Math.floor(total / likedTracksLimit) + 1; j++) {
      const offset = j * likedTracksLimit;
      const url = 'https://api.spotify.com/v1/me/tracks';
      const queryParam = `?limit=${likedTracksLimit}&offset=${offset}`;
      const formatedTracks = await this.getLikedTracks(url, queryParam);

      tracks = tracks.concat(formatedTracks);
    }

    trackIds = tracks.map((track) => track.id);

    // Get all the audio features by batches
    for (let i = 0; i <= Math.floor(total / audioFeaturesLimit); i++) {
      const bactchTrackIds = trackIds.slice(
        audioFeaturesLimit * i,
        audioFeaturesLimit * (i + 1)
      );

      const formatedFeatures = await this.getAudioFeatures(bactchTrackIds);
      audioFeatures = audioFeatures.concat(formatedFeatures);
    }

    artistIds = tracks.map((track) => track.artists[0].id);
    // Get all the artists by batches to extract genres
    for (let i = 0; i <= Math.floor(artistIds.length / artistLimit); i++) {
      const bactchArtistIds = artistIds.slice(
        artistLimit * i,
        artistLimit * (i + 1)
      );
      const artists = await this.getArtists(bactchArtistIds);
      const genres = artists.map((artist) => artist.genres);
      totalGenres = totalGenres.concat(genres);
    }

    // concat all items into one track
    fullTracks = tracks.map((track, i) => ({
      ...track,
      ...audioFeatures[i],
      genres: totalGenres[i],
    }));

    console.log(fullTracks);

    // TODO: verify that tracks are not written if they already exist
    // write the tracks by batches
    for (let i = 0; i <= Math.floor(total / firebaseWriteLimit); i++) {
      const bactchFullTracks = fullTracks.slice(
        firebaseWriteLimit * i,
        firebaseWriteLimit * (i + 1)
      );
      const batch = this.db.batch();

      for (const track of bactchFullTracks) {
        const ref = trackCollection.doc(track.id);
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

  public async savePlaylists() {
    // get active user's playlists by batches
    const playlists: Playlist[] = await this.getActiveUserPlaylistsByBatches();
    // extract the tracks
    const tracks = await this.getPlaylistsTracksByBatches(playlists);
    // Get audio features
    const trackIds: string[] = tracks.map((track) => track.id);
    const audioFeatures = this.getAudioFeaturesByBatches(trackIds);
    // Get genres
    const artistIds: string[] = tracks.map((track) => track.artists[0].id);
    const genres = await this.getGenresByBatches(artistIds);
    // concat all items into one track
    const fullTracks: Track[] = tracks.map((track, i) => ({
      ...track,
      ...audioFeatures[i],
      genres: genres[i],
    }));

    console.log(fullTracks);
    // write playlists by batches
    const playlistCollection = this.db.collection('playlists');
    await this.firestoreWriteBatches(playlistCollection, playlists);

    // write tracks by batches
    const trackCollection = this.db.collection('tracks');
    await this.firestoreWriteBatches(trackCollection, fullTracks);

    // write playlist ids in user doc
    const user = this.authQuery.getActive();
    const userRef = this.db.collection('users').doc(user.id);
    const playlistIds = playlists.map((playlist) => playlist.id);
    userRef
      .update({ playlistIds })
      .then((_) => console.log('playlistIds saved on user'))
      .catch((error) => console.log(error));
  }

  private async getActiveUserPlaylistsByBatches(): Promise<Playlist[]> {
    const user = this.authQuery.getActive();
    const playlistLimit = 50;
    const total = await this.getTotalPlaylists();

    let playlists: Playlist[] = [];
    for (let j = 0; j <= Math.floor(total / playlistLimit) + 1; j++) {
      const offset = j * playlistLimit;
      const url = `https://api.spotify.com/v1/users/${user.spotifyId}/playlists`;
      const queryParam = `?limit=${playlistLimit}&offset=${offset}`;

      const lists = await this.getPlaylists(url, queryParam);

      playlists = playlists.concat(lists);
    }
    return playlists;
  }

  private async getPlaylistsTracksByBatches(
    playlists: Playlist[]
  ): Promise<Track[]> {
    const playlistTracksLimit = 100;
    let totalPlaylistTracks: Track[] = [];
    // get the tracks from all playlists
    for (let m = 0; m < playlists.length; m++) {
      let playlistTracks: Track[] = [];
      // get all the playlist tracks by batches
      for (
        let l = 0;
        l <= Math.floor(playlists[m].tracks.total / playlistTracksLimit) + 1;
        l++
      ) {
        const offset = l * playlistTracksLimit;
        const url = playlists[m].tracks.href;
        const queryParam = `?limit=${playlistTracksLimit}&offset=${offset}`;
        const formatedTracks = await this.getPlaylistTracks(url, queryParam);

        playlistTracks = playlistTracks.concat(formatedTracks);
      }
      let trackIds = playlistTracks.map((track) => track.id);
      playlists[m].trackIds = trackIds;
      totalPlaylistTracks = totalPlaylistTracks.concat(playlistTracks);
    }
    return totalPlaylistTracks;
  }

  private async getAudioFeaturesByBatches(
    trackIds: string[]
  ): Promise<Track[]> {
    let audioFeatures: Track[] = [];
    const audioFeaturesLimit = 100;

    for (
      let i = 0;
      i <= Math.floor(trackIds.length / audioFeaturesLimit);
      i++
    ) {
      const bactchTrackIds = trackIds.slice(
        audioFeaturesLimit * i,
        audioFeaturesLimit * (i + 1)
      );

      const formatedFeatures = await this.getAudioFeatures(bactchTrackIds);
      audioFeatures = audioFeatures.concat(formatedFeatures);
    }

    return audioFeatures;
  }

  // Get all the artists by batches to extract genres
  private async getGenresByBatches(artistIds: string[]): Promise<string[][]> {
    const artistLimit = 50;
    let totalGenres: string[][] = [[]];
    for (let i = 0; i <= Math.floor(artistIds.length / artistLimit); i++) {
      const bactchArtistIds = artistIds.slice(
        artistLimit * i,
        artistLimit * (i + 1)
      );
      const artists = await this.getArtists(bactchArtistIds);
      const genres = artists.map((artist) => artist.genres);
      totalGenres = totalGenres.concat(genres);
    }
    return totalGenres;
  }

  private async firestoreWriteBatches(
    collection: firebase.firestore.CollectionReference,
    objects
  ) {
    const firebaseWriteLimit = 500;
    for (let i = 0; i <= Math.floor(objects.length / firebaseWriteLimit); i++) {
      const bactchObject = objects.slice(
        firebaseWriteLimit * i,
        firebaseWriteLimit * (i + 1)
      );
      const batch = this.db.batch();

      for (const object of bactchObject) {
        const ref = collection.doc(object.id);
        batch.set(ref, object);
      }

      batch
        .commit()
        .then((_) => console.log(`batch of object ${i} saved`))
        .catch((error) => console.log(error));
    }
  }

  private async getHeaders() {
    const user = await this.authQuery.getActive();
    const headers = new HttpHeaders().set(
      'Authorization',
      'Bearer ' + user.token
    );
    return headers;
  }

  public async getLikedTracks(
    url: string,
    queryParam: string
  ): Promise<Track[]> {
    return await (await this.getPromisedObjects(url, queryParam))
      .pipe(
        map((tracks: { items: SpotifySavedTrack[] }) =>
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

  public async getTotalLikedTracks(): Promise<number> {
    const url = 'https://api.spotify.com/v1/me/tracks';
    const queryParam = '?limit=1';

    const tracks = await (await this.getPromisedObjects(url, queryParam))
      .pipe(first())
      .toPromise();
    // @ts-ignore: Unreachable code error
    return tracks.total;
  }

  public async getPlaylistTracks(
    url: string,
    queryParam: string
  ): Promise<Track[]> {
    return await (await this.getPromisedObjects(url, queryParam))
      .pipe(
        map((playlistTracks: { items: SpotifyPlaylistTrack[] }) =>
          playlistTracks.items.map((item) =>
            createTrack({
              added_at: item.added_at,
              added_by: item.added_by,
              ...item.track,
            })
          )
        ),
        first()
      )
      .toPromise();
  }

  public async getPlaylists(
    url: string,
    queryParam: string
  ): Promise<Playlist[]> {
    return await (await this.getPromisedObjects(url, queryParam))
      .pipe(
        map((paging: { items: Playlist[] }) => paging.items),
        first()
      )
      .toPromise();
  }

  public async getTotalPlaylists(): Promise<number> {
    const user = this.authQuery.getActive();
    const url = `https://api.spotify.com/v1/users/${user.spotifyId}/playlists`;
    const queryParam = '?limit=1';

    const playlists = await (await this.getPromisedObjects(url, queryParam))
      .pipe(first())
      .toPromise();
    // @ts-ignore: Unreachable code error
    return playlists.total;
  }

  public async getAudioFeatures(trackIds: string[]): Promise<Track[]> {
    const url = 'https://api.spotify.com/v1/audio-features/';
    let queryParam: string = '?ids=';
    for (const trackId of trackIds) {
      queryParam = queryParam + trackId + ',';
    }

    return await (await this.getPromisedObjects(url, queryParam))
      .pipe(
        map((audioFeat: { audio_features: SpotifyAudioFeatures[] }) =>
          audioFeat.audio_features.map((feature) =>
            createAudioFeatures(feature)
          )
        ),
        first()
      )
      .toPromise();
  }

  public async getArtists(artistIds: string[]): Promise<Artist[]> {
    const url = 'https://api.spotify.com/v1/artists';
    let queryParam: string = '?ids=';
    for (const artistId of artistIds) {
      queryParam = queryParam + artistId + ',';
    }
    queryParam = queryParam.substring(0, queryParam.length - 1);

    return await (await this.getPromisedObjects(url, queryParam))
      .pipe(
        map((artists: { artists: Artist[] }) => artists.artists),
        first()
      )
      .toPromise();
  }

  public async getPromisedAlbums(trackIds: string[]) {
    const headers = await this.getHeaders();
    const url = 'https://api.spotify.com/v1/albums';
    let queryParam: string = '?ids=';
    for (const trackId of trackIds) {
      queryParam = queryParam + trackId + ',';
    }
    queryParam = queryParam.substring(0, queryParam.length - 1);

    return this.getPromisedObjects(url, queryParam);
  }

  public async getPromisedObjects(url, queryParam) {
    const headers = await this.getHeaders();

    return this.http.get(`${url + queryParam}`, { headers }).pipe(
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
  }

  public async addToPlayback(trackUri: string) {
    const baseUrl = 'https://api.spotify.com/v1/me/player/queue';
    const queryParam = `?uri=${trackUri}`;

    return this.postRequests(baseUrl, queryParam, null);
  }

  public async playNext() {
    const baseUrl = 'https://api.spotify.com/v1/me/player/next';

    return this.postRequests(baseUrl, '', null);
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

  public async play(trackUris?: string[]) {
    const user = this.authQuery.getActive();
    const baseUrl = 'https://api.spotify.com/v1/me/player/play';
    const queryParam =
      user.deviceId && trackUris ? `?device_id=${user.deviceId}` : '';
    const body = trackUris ? { uris: trackUris } : null;

    return this.putRequests(baseUrl, queryParam, body);
  }

  public async pause() {
    const baseUrl = 'https://api.spotify.com/v1/me/player/pause';

    return this.putRequests(baseUrl, '', null);
  }

  public async seekPosition(position_ms: number) {
    const baseUrl = 'https://api.spotify.com/v1/me/player/seek';
    const queryParam = `?position_ms=${position_ms}`;

    return this.putRequests(baseUrl, queryParam, null);
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
}
