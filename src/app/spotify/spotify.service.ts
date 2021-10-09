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
import { AuthQuery, AuthService } from '../auth/+state';
import { Playlist } from '../playlists/+state';
import {
  Track,
  Artist,
  createAudioFeatures,
  createTrack,
  SpotifyAudioFeatures,
  SpotifyPlaylistTrack,
  SpotifySavedTrack,
  TrackService,
  TrackStore,
  TrackQuery,
  SpotifyTrack,
  TrackState,
} from '../tracks/+state';
import { PlayerService } from '../player/+state/player.service';
import { PlayerQuery } from '../player/+state';
import { AkitaFilter } from 'akita-filters-plugin';

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
    private playerQuery: PlayerQuery,
    private playerService: PlayerService,
    private trackStore: TrackStore,
    private trackQuery: TrackQuery,
    private trackService: TrackService,
    private http: HttpClient
  ) {}

  public async initializePlayer() {
    // @ts-ignore: Unreachable code error
    const { Player } = await this.waitForSpotifyWebPlaybackSDKToLoad();
    const token$ = this.authQuery.token$;

    // instantiate the player
    token$
      .pipe(
        tap(async (token) => {
          const player = new Player({
            name: 'Tracklists',
            getOAuthToken: (callback) => {
              callback(token);
            },
          });
          await player.connect();
          // Ready
          player.addListener('ready', ({ device_id }) => {
            this.authService.saveDeviceId(device_id);
          });

          // when player state change, set active the track
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
          });
        }),
        first()
      )
      .subscribe();
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
    const startTime = performance.now();
    console.log(startTime);
    this.trackStore.setLoading(true);

    // get active user's playlists by batches
    const startTimeGetPlaylist = performance.now();

    const playlists: Playlist[] = await this.getActiveUserPlaylistsByBatches();
    const endTimeGetPlaylist = performance.now();
    console.log(
      `Call to GetPlaylist took ${
        endTimeGetPlaylist - startTimeGetPlaylist
      } milliseconds`
    );
    // update the front loader with more details for the user
    this.trackService.updateLoadingItem(`Saving your playlists...`);
    // extract the tracks from the playlists
    const startTimeGetTracks = performance.now();

    const tracks = await this.getPlaylistsTracksByBatches(playlists);
    const endTimeGetTracks = performance.now();
    console.log(
      `Call to GetTracks took ${
        endTimeGetTracks - startTimeGetTracks
      } milliseconds`
    );
    // Get audio features
    const trackIds: string[] = tracks.map((track) => track.id);
    const startTimeGetAudioFeatures = performance.now();

    const audioFeatures = await this.getAudioFeaturesByBatches(trackIds);
    const endTimeGetAudioFeatures = performance.now();
    console.log(
      `Call to GetAudioFeatures took ${
        endTimeGetAudioFeatures - startTimeGetAudioFeatures
      } milliseconds`
    );

    // Get genres
    // adds empty genres when artist undefined
    const emptyArtistPosition: number[] = [];
    const startTimeGetArtistIds = performance.now();
    const artistIds: string[] = tracks.map((track, i) => {
      if (track.artists[0].id) {
        return track.artists[0].id;
      } else {
        emptyArtistPosition.push(i);
        return '';
      }
    });
    const endTimeGetArtistIds = performance.now();
    console.log(
      `Call to GetArtistIds took ${
        endTimeGetArtistIds - startTimeGetArtistIds
      } milliseconds`
    );
    const startTimeGetGenres = performance.now();

    const genres = await this.getGenresByBatches(artistIds);
    const endTimeGetGenres = performance.now();
    console.log(
      `Call to GetGenres took ${
        endTimeGetGenres - startTimeGetGenres
      } milliseconds`
    );

    const startTimeBuildFullTracks = performance.now();

    for (const position of emptyArtistPosition) {
      genres.splice(position, 0, []);
    }
    // concat all items into one track
    const fullTracks: Track[] = tracks.map((track, i) => ({
      ...track,
      ...audioFeatures[i],
      genres: genres[i],
    }));
    const endTimeBuildFullTracks = performance.now();
    console.log(
      `Call to BuildFullTracks took ${
        endTimeBuildFullTracks - startTimeBuildFullTracks
      } milliseconds`
    );
    // write playlists by batches
    const playlistCollection = this.db.collection('playlists');
    await this.firestoreWriteBatches(
      playlistCollection,
      playlists,
      'playlists'
    );
    console.log('playlist tracks: ', fullTracks);
    // write tracks by batches
    const trackCollection = this.db.collection('tracks');
    await this.firestoreWriteBatches(trackCollection, fullTracks, 'tracks');

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
    this.saveLikedTracks().then((_) => {
      const endTime = performance.now();

      console.log(
        `Call to savePlaylist took ${endTime - startTime} milliseconds`
      );
    });
  }

  private async saveLikedTracks() {
    this.trackService.updateLoadingItem(`Saving your liked tracks...`);
    // TODO: refactor code with a getFullTracks function
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
    await this.firestoreWriteBatches(trackCollection, fullTracks, 'tracks');

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

    // extract every genres of each track
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
        // count each db operation to avoid limit
        operationCounter += 2;

        if (operationCounter >= firebaseWriteLimit) {
          batchArray.push(this.db.batch());
          batchIndex++;
          operationCounter = 0;
        }
      });
    });
    // push batch writing
    batchArray.forEach(async (batch, i, batches) => {
      await batch
        .commit()
        .then((_) => console.log(`batch ${i} of genres saved`))
        .catch((error) => console.log(error, batch));
      // catch last operation of a new user music loading
      if (i === batches.length - 1 && playlist.type === 'likedTracks') {
        this.trackService.setFirestoreTracks();
        this.trackService.updateSpinner(false);
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
    // TODO: PARALLELIZE THIS CALLS
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

  private async firestoreWriteBatches(
    collection: firebase.firestore.CollectionReference,
    objects,
    type: string
  ) {
    // let firebaseWriteLimit: number;
    const userId = this.authQuery.getActiveId();
    const startTime = performance.now();
    await Promise.all(
      objects.map((object) => {
        type === 'tracks'
          ? collection
              .doc(object.id)
              .set(
                { ...object, userIds: firestore.FieldValue.arrayUnion(userId) },
                { merge: true }
              )
          : collection.doc(object.id).set(object, { merge: true });
      })
    ).then((_) => {
      const endTime = performance.now();

      console.log(
        `Call to firestoreWriteBatches ${type} took ${
          endTime - startTime
        } milliseconds`
      );
    });

    // tracks write twice, including userId
    /*   type === 'tracks' ? (firebaseWriteLimit = 250) : (firebaseWriteLimit = 500);
    const userId = this.authQuery.getActiveId();
    for (let i = 0; i <= Math.floor(objects.length / firebaseWriteLimit); i++) {
      const bactchObject = objects.slice(
        firebaseWriteLimit * i,
        firebaseWriteLimit * (i + 1)
      );
      const batch = this.db.batch();

      for (const object of bactchObject) {
        if (object.id) {
          const ref = collection.doc(object.id);
          // if it's tracks, add also userId
          type === 'tracks'
            ? batch.set(
                ref,
                { ...object, userIds: firestore.FieldValue.arrayUnion(userId) },
                { merge: true }
              )
            : batch.set(ref, object, { merge: true });
        } else {
          console.log('cant save object', object);
        }
      }

      batch
        .commit()
        .then((_) => {
          console.log(`batch of ${type} ${i} saved`);
          const endTime = performance.now();

          console.log(
            `Call to firestoreWriteBatches ${type} took ${
              endTime - startTime
            } milliseconds`
          );
        })
        .catch((error) => console.log(error));
    } */
  }

  private async getHeaders() {
    const token$ = this.authQuery.token$;
    let headers: HttpHeaders;
    token$
      .pipe(
        tap(
          (token) =>
            (headers = new HttpHeaders().set(
              'Authorization',
              'Bearer ' + token
            ))
        ),
        first()
      )
      .subscribe();
    return headers;
  }

  public async getLikedTracks(
    url: string,
    queryParam: string
  ): Promise<Track[]> {
    return await (
      await this.getPromisedObjects(url, queryParam)
    )
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
    return await (
      await this.getPromisedObjects(url, queryParam)
    )
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
    return await (
      await this.getPromisedObjects(url, queryParam)
    )
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
            const trackCollection = this.db.collection('tracks');
            this.firestoreWriteBatches(trackCollection, fullTracks, 'tracks');

            return fullTracks;
          }
        }),
        first()
      )
      .toPromise();

    return recommended;
  }

  public async getPromisedObjects(url, queryParam) {
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

  // PLAYER

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

  public async play(trackUris?: string[]) {
    // Not documented by spotify but it looks like there is a limit around 700 tracks
    const urisLimit = 700;
    if (trackUris?.length > urisLimit)
      trackUris = trackUris.slice(0, urisLimit - 1);
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

  private async putRequests(baseUrl: string, queryParam: string, body) {
    const headers = await this.getHeaders();

    return this.http
      .put(`${baseUrl + queryParam}`, body, {
        headers,
      })
      .pipe(first())
      .toPromise();
  }

  public async removeFromLikedTracks(trackId: string) {
    const baseUrl = 'https://api.spotify.com/v1/me/tracks';
    const queryParam = `?ids=${trackId}`;

    return this.deleteRequests(baseUrl, queryParam, null);
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

  // PLAYLISTS

  public async createPlaylist(name: string) {
    const user = this.authQuery.getActive();
    const baseUrl = `https://api.spotify.com/v1/users/${user.spotifyId}/playlists`;
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
}
