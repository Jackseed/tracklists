import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, timer } from 'rxjs';
import {
  delayWhen,
  filter,
  first,
  map,
  retryWhen,
  take,
  tap,
} from 'rxjs/operators';
import firebase from 'firebase';
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
      this.updatePosition(track.id, state.position);
      state.paused === pause
        ? false
        : this.updatePaused(track.id, state.paused);
    });
  }

  public updatePosition(trackId: string, position: number) {
    this.trackStore.ui.upsert(trackId, { position });
  }

  public updatePaused(trackId: string, paused: boolean) {
    this.trackStore.ui.upsert(trackId, { paused });
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
    const playlistLimit = 50;
    const playlistTracksLimit = 100;
    const artistLimit = 50;
    const audioFeaturesLimit = 100;
    const firebaseWriteLimit = 500;
    const user = this.authQuery.getActive();
    const url = `https://api.spotify.com/v1/users/${user.spotifyId}/playlists`;
    const total = await this.playlistQuery.getTotalPlaylists(url);

    let playlists: Playlist[] = [];
    let totalPlaylistTracks: Track[] = [];
    let totalPlaylistTrackIds: string[];
    let artistIds: string[];
    let audioFeatures: Track[] = [];
    let totalPlaylistFullTracks: Track[] = [];
    let totalGenres: string[][] = [[]];

    const playlistCollection = this.db.collection('playlists');
    const trackCollection = this.db.collection('tracks');
    const userRef = this.db.collection('users').doc(user.id);

    // get all the playlists by batches
    for (let j = 0; j <= Math.floor(total / playlistLimit) + 1; j++) {
      const offset = j * playlistLimit;
      const url = `https://api.spotify.com/v1/users/${user.spotifyId}/playlists?limit=${playlistLimit}&offset=${offset}`;
      const lists = await this.playlistQuery.getPlaylists(url);

      playlists = playlists.concat(lists);
    }

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

    totalPlaylistTrackIds = totalPlaylistTracks.map((track) => track.id);

    // Get all the audio features by batches
    for (
      let i = 0;
      i <= Math.floor(totalPlaylistTrackIds.length / audioFeaturesLimit);
      i++
    ) {
      const bactchTrackIds = totalPlaylistTrackIds.slice(
        audioFeaturesLimit * i,
        audioFeaturesLimit * (i + 1)
      );

      const formatedFeatures = await this.getAudioFeatures(bactchTrackIds);
      audioFeatures = audioFeatures.concat(formatedFeatures);
    }

    artistIds = totalPlaylistTracks.map((track) => track.artists[0].id);
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
    totalPlaylistFullTracks = totalPlaylistTracks.map((track, i) => ({
      ...track,
      ...audioFeatures[i],
      genres: totalGenres[i],
    }));

    // write the playlists by batches
    for (let i = 0; i <= Math.floor(total / firebaseWriteLimit); i++) {
      const bactchPlaylist = playlists.slice(
        firebaseWriteLimit * i,
        firebaseWriteLimit * (i + 1)
      );
      const batch = this.db.batch();

      for (const playlist of bactchPlaylist) {
        const ref = playlistCollection.doc(playlist.id);
        batch.set(ref, playlist);
      }

      batch
        .commit()
        .then((_) => console.log(`batch of plalist ${i} saved`))
        .catch((error) => console.log(error));
    }

    // write the playlist tracks by batches
    for (
      let n = 0;
      n <= Math.floor(totalPlaylistFullTracks.length / firebaseWriteLimit);
      n++
    ) {
      const bactchTrack = totalPlaylistFullTracks.slice(
        firebaseWriteLimit * n,
        firebaseWriteLimit * (n + 1)
      );
      const batch = this.db.batch();

      for (const track of bactchTrack) {
        const ref = trackCollection.doc(track.id);
        batch.set(ref, track);
      }

      batch
        .commit()
        .then((_) => console.log(`batch of tracks ${n} saved`))
        .catch((error) => console.log(error));
    }

    const playlistIds = playlists.map((playlist) => playlist.id);
    // write playlist ids in the user doc
    userRef
      .update({ playlistIds })
      .then((_) => console.log('playlistIds saved on user'))
      .catch((error) => console.log(error));
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

  public async getAddToPlaybackRequest(trackUri: string) {
    const baseUrl = 'https://api.spotify.com/v1/me/player/queue';
    const queryParam = `?uri=${trackUri}`;

    return this.postRequests(baseUrl, queryParam, null);
  }

  public async getPlayNextRequest() {
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
