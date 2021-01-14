import {
  HttpClient,
  HttpErrorResponse,
  HttpHeaders,
} from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firestore } from 'firebase/app';
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
import firebase from 'firebase/app';
import { AuthQuery, AuthService, AuthStore } from '../auth/+state';
import { Playlist } from '../playlists/+state';
import {
  Track,
  Artist,
  createAudioFeatures,
  createTrack,
  SpotifyAudioFeatures,
  SpotifyPlaylistTrack,
  SpotifySavedTrack,
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
  db = firebase.firestore();

  constructor(
    private authStore: AuthStore,
    private authQuery: AuthQuery,
    private authService: AuthService,
    private playerQuery: PlayerQuery,
    private playerService: PlayerService,
    private http: HttpClient
  ) {}

  public async initializePlayer() {
    // @ts-ignore: Unreachable code error
    const { Player } = await this.waitForSpotifyWebPlaybackSDKToLoad();
    const token = this.authQuery.token;

    // instantiate the player
    const player = new Player({
      name: 'Listy player',
      getOAuthToken: (callback) => {
        callback(token);
      },
    });

    let connected = await player.connect();

    // Ready
    player.addListener('ready', ({ device_id }) => {
      this.authService.saveDeviceId(device_id);
    });

    // when player state change, set active the track
    player.on('player_state_changed', async (state) => {
      if (!state) return;
      const track = state.track_window.current_track;
      const pause = this.playerQuery.getPaused(track.id);
      
      this.playerService.add(track);
      this.playerService.setActive(track.id);
      this.playerService.updatePosition(track.id, state.position);
      // update playing track with state paused
      state.paused === pause
        ? false
        : this.playerService.updatePaused(track.id, state.paused);
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

  public async savePlaylists() {
    this.authStore.setLoading(true);
    // get active user's playlists by batches
    const playlists: Playlist[] = await this.getActiveUserPlaylistsByBatches();
    // extract the tracks
    const tracks = await this.getPlaylistsTracksByBatches(playlists);
    // Get audio features
    const trackIds: string[] = tracks.map((track) => track.id);
    const audioFeatures = await this.getAudioFeaturesByBatches(trackIds);
    // Get genres
    const artistIds: string[] = tracks.map((track) => track.artists[0].id);
    const genres = await this.getGenresByBatches(artistIds);
    // concat all items into one track
    const fullTracks: Track[] = tracks.map((track, i) => ({
      ...track,
      ...audioFeatures[i],
      genres: genres[i],
    }));
    console.log(
      'tracks : ',
      tracks,
      'audioFeatures: ',
      audioFeatures,
      'genres: ',
      genres
    );

    console.log('playlist tracks: ', fullTracks);
    // write playlists by batches
    const playlistCollection = this.db.collection('playlists');
    await this.firestoreWriteBatches(playlistCollection, playlists);

    // write tracks by batches
    const trackCollection = this.db.collection('tracks');
    await this.firestoreWriteBatches(trackCollection, fullTracks);

    // write playlist ids & track ids in user doc
    const user = this.authQuery.getActive();
    const userRef = this.db.collection('users').doc(user.id);
    const playlistIds = playlists.map((playlist) => playlist.id);
    userRef
      .update({ playlistIds, trackIds })
      .then((_) => console.log('playlistIds saved on user'))
      .catch((error) => console.log(error));

    // write genres on playlists
    playlists.forEach((playlist) =>
      this.extractGenresFromTrackToPlaylist(playlist, fullTracks)
    );

    // save the liked tracks as a playlist
    this.saveLikedTracks();
  }

  private async saveLikedTracks() {
    // get liked tracks by batches
    const tracks: Track[] = await this.getLikedTracksByBatches();
    const trackIds: string[] = tracks.map((track) => track.id);
    // Get audio features by batches
    const audioFeatures: Track[] = await this.getAudioFeaturesByBatches(
      trackIds
    );
    // Get genres
    const artistIds: string[] = tracks.map((track) => track.artists[0].id);
    const genres = await this.getGenresByBatches(artistIds);

    // concat all items into one track
    const fullTracks: Track[] = tracks.map((track, i) => ({
      ...track,
      ...audioFeatures[i],
      genres: genres[i],
    }));

    console.log('liked tracks: ', fullTracks);

    // write tracks by batches
    const trackCollection = this.db.collection('tracks');
    await this.firestoreWriteBatches(trackCollection, fullTracks);

    // create liked tracks as a playlist
    const user = this.authQuery.getActive();
    const playlist: Playlist = {
      id: `${user.id}LikedTracks`,
      name: `Liked tracks`,
      trackIds,
      type: 'likedTracks',
    };

    // write the playlist
    const playlistCollection = this.db.collection('playlists');
    await playlistCollection
      .doc(playlist.id)
      .set(playlist, { merge: true })
      .then((_) => console.log('liked tracks saved as a playlist'))
      .catch((error) => console.log(error));

    // add the liked tracks playlist & the trackIds in the user doc
    const userRef = this.db.collection('users').doc(user.id);
    userRef
      .update({
        playlistIds: firestore.FieldValue.arrayUnion(playlist.id),
        trackIds: firestore.FieldValue.arrayUnion(...trackIds),
      })
      .then((_) => console.log('liked tracks playlist added on user'))
      .catch((error) => console.log(error));

    // write genres on playlist
    this.extractGenresFromTrackToPlaylist(playlist, fullTracks);
  }

  private extractGenresFromTrackToPlaylist(
    playlist: Playlist,
    tracks: Track[]
  ) {
    const playlistTracks: Track[] = tracks.filter((track) =>
      playlist.trackIds.includes(track.id)
    );
    const genreCollection = this.db
      .collection('playlists')
      .doc(playlist.id)
      .collection('genres');
    const firebaseWriteLimit = 497;
    const batchArray = [];
    batchArray.push(this.db.batch());
    let operationCounter = 0;
    let batchIndex = 0;

    playlistTracks.forEach((track) => {
      track.genres.forEach((genre) => {
        const ref = genreCollection.doc(genre);
        batchArray[batchIndex].set(
          ref,
          {
            id: genre,
            trackIds: firestore.FieldValue.arrayUnion(track.id),
          },
          { merge: true }
        );

        operationCounter += 2;

        if (operationCounter >= firebaseWriteLimit) {
          batchArray.push(this.db.batch());
          batchIndex++;
          operationCounter = 0;
        }
      });
    });

    batchArray.forEach(async (batch, i, batches) => {
      await batch
        .commit()
        .then((_) => console.log(`batch of genres saved`))
        .catch((error) => console.log(error, batch));
      if (i === batches.length - 1) {
        console.log('coucou');
        this.authStore.setLoading(false);
      }
    });
  }

  private async getLikedTracksByBatches(): Promise<Track[]> {
    const likedTracksLimit = 50;
    const total: number = await this.getTotalLikedTracks();
    let tracks: Track[] = [];
    for (let j = 0; j <= Math.floor(total / likedTracksLimit) + 1; j++) {
      const offset = j * likedTracksLimit;
      const url = 'https://api.spotify.com/v1/me/tracks';
      const queryParam = `?limit=${likedTracksLimit}&offset=${offset}`;
      const formatedTracks = await this.getLikedTracks(url, queryParam);

      tracks = tracks.concat(formatedTracks);
    }
    return tracks;
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
      let genres: string[][];
      if (artists) {
        genres = artists.map((artist) => (artist ? artist.genres : []));
        // first attempt to handle errors by returning empty genres
      } else {
        genres = Array.from(Array(bactchArtistIds.length), () => []);
      }
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
        if (object.id) {
          const ref = collection.doc(object.id);
          batch.set(ref, object);
        } else {
          console.log('cant save object', object);
        }
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
    // add all the trackIds
    for (const trackId of trackIds) {
      queryParam = queryParam + trackId + ',';
    }
    // remove last comma
    queryParam = queryParam.substring(0, queryParam.length - 1);
    return await (await this.getPromisedObjects(url, queryParam))
      .pipe(
        map((audioFeat: { audio_features: SpotifyAudioFeatures[] }) =>
          audioFeat.audio_features.map((feature) => {
            if (feature === null) {
              console.log(feature);
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
      queryParam = queryParam + artistId + ',';
    }
    queryParam = queryParam.substring(0, queryParam.length - 1);

    return await (await this.getPromisedObjects(url, queryParam))
      .pipe(
        map((artists: { artists: Artist[] }) => {
          console.log(artists.artists);
          return artists.artists;
        }),
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
          tap((error) => console.log('error: ', error)),
          map((error) => {
            if (error.status === 400) {
              console.log('400 here');
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
          console.log('salut');
          return of([{}]);
        }
      })
    );
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

  public async addToPlayback(trackUri: string) {
    const baseUrl = 'https://api.spotify.com/v1/me/player/queue';
    const queryParam = `?uri=${trackUri}`;

    return this.postRequests(baseUrl, queryParam, null);
  }

  public async playNext() {
    const baseUrl = 'https://api.spotify.com/v1/me/player/next';

    return this.postRequests(baseUrl, '', null);
  }

  public async createPlaylist(name: string) {
    const user = this.authQuery.getActive();
    const baseUrl = `https://api.spotify.com/v1/users/${user.spotifyId}/playlists`;
    const body = { name };

    return this.postRequests(baseUrl, '', body);
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
