import {
  Artist,
  createAudioFeatures,
  Playlist,
  SpotifyAudioFeatures,
  SpotifyPlaylistTrack,
  FullTrack,
  User,
  createTrack,
  SpotifySavedTrack,
  Track,
  AudioFeatures,
} from './data';
const admin = require('firebase-admin');
const axios = require('axios').default;

// TODO: replace user with userId
export async function saveUserTracks(data: any) {
  const startTime = performance.now();
  const user = data.user;

  // get active user's playlists by batches
  const startTimeGetPlaylist = performance.now();
  const playlists: Playlist[] = await getSpotifyObjectsByBatches(
    user,
    'playlists'
  );
  const endTimeGetPlaylist = performance.now();
  console.log(
    `Call to GetPlaylist took ${
      endTimeGetPlaylist - startTimeGetPlaylist
    } milliseconds`
  );
  console.log('playlist amount: ', playlists.length);
  const fullTracks = await getUserPlaylistFullTracks(user, playlists);
  const trackIds: string[] = fullTracks.map((track) => track.id!);

  // write playlists by batches
  const playlistCollection = admin.firestore().collection('playlists');
  await firestoreWrite(user, playlistCollection, playlists, 'playlists');

  // write tracks by batches
  const trackCollection = admin.firestore().collection('tracks');
  await firestoreWrite(user, trackCollection, fullTracks, 'tracks');

  // write playlist ids & track ids in user doc
  const userRef = admin.firestore().collection('users').doc(user.id);
  const playlistIds = playlists.map((playlist) => playlist.id);
  userRef
    .update({ playlistIds, trackIds })
    .then((_: any) => console.log('playlistIds saved on user'))
    .catch((error: any) => console.log(error.response.data));

  // write genres on playlists
  playlists.forEach((playlist) =>
    extractGenresFromTrackToPlaylist(playlist, fullTracks)
  );

  // save the liked tracks as a playlist
  saveUserLikedTracks(user).then((_) => {
    const endTime = performance.now();

    console.log(
      `Call to savePlaylist took ${endTime - startTime} milliseconds`
    );
  });
}

async function getUserPlaylistFullTracks(
  user: User,
  playlists: Playlist[]
): Promise<Partial<FullTrack>[]> {
  // extract the tracks from the playlists
  const startTimeGetTracks = performance.now();

  const tracks = await getPlaylistsTracksByBatches(user, playlists);
  console.log('track amount: ', tracks.length);
  const endTimeGetTracks = performance.now();
  console.log(
    `Call to GetTracks took ${
      endTimeGetTracks - startTimeGetTracks
    } milliseconds`
  );
  // Get audio features
  const trackIds: string[] = tracks.map((track) => track.id!);

  const startTimeGetAudioFeatures = performance.now();

  const audioFeatures = await getSpotifyObjectsByBatches(
    user,
    'audioFeatures',
    trackIds
  );
  const endTimeGetAudioFeatures = performance.now();
  console.log(
    `Call to GetAudioFeatures took ${
      endTimeGetAudioFeatures - startTimeGetAudioFeatures
    } milliseconds`
  );
  console.log('tracks amount', tracks.length);
  const genres = await getGenreTracks(user, tracks);

  // concat all items into one track
  const fullTracks: Partial<FullTrack>[] = tracks.map((track, i) => ({
    ...track,
    ...audioFeatures[i],
    genres: genres[i],
  }));

  console.log('playlist tracks: ', fullTracks.length);

  return fullTracks;
}

async function getGenreTracks(
  user: User,
  tracks: Track[]
): Promise<string[][]> {
  // adds empty genres when artist is undefined
  const emptyArtistPosition: number[] = [];
  const artistIds: string[] = tracks.map((track, i) => {
    if (track.artists![0].id) {
      return track.artists![0].id;
    } else {
      emptyArtistPosition.push(i);
      return '';
    }
  });
  console.log('artists amount: ', artistIds.length);
  const startTimeGetGenres = performance.now();
  const genres = await getGenresByBatches(user, artistIds);
  console.log('genre amount: ', genres.length);
  const endTimeGetGenres = performance.now();
  console.log(
    `Call to GetGenres took ${
      endTimeGetGenres - startTimeGetGenres
    } milliseconds`
  );

  // add empty genres when no artist
  for (const position of emptyArtistPosition) {
    genres.splice(position, 0, []);
  }

  return genres;
}

async function saveUserLikedTracks(user: User) {
  // TODO: refactor code with a getFullTracks function
  // get liked tracks by batches
  const tracks: Track[] = (await getSpotifyObjectsByBatches(
    user,
    'likedTracks'
  )) as Track[];

  const trackIds: string[] = tracks.map((track) => track.id!);
  // Get audio features by batches
  const audioFeatures = (await getSpotifyObjectsByBatches(
    user,
    'audioFeatures',
    trackIds
  )) as AudioFeatures[];
  // Get genres
  const genres = await getGenreTracks(user, tracks);

  // concat all items into one track
  const fullTracks: Partial<FullTrack>[] = tracks.map((track, i) => ({
    ...track,
    ...audioFeatures[i],
    genres: genres[i],
  }));

  console.log('liked tracks: ', fullTracks.length);

  // write tracks by batches
  const trackCollection = admin.firestore().collection('tracks');
  await firestoreWrite(user, trackCollection, fullTracks, 'tracks');

  // create liked tracks as a playlist
  const playlist: Playlist = {
    id: `${user.id}LikedTracks`,
    name: `Liked tracks`,
    trackIds,
    type: 'likedTracks',
  };

  // write the playlist
  const playlistCollection = admin.firestore().collection('playlists');
  await playlistCollection
    .doc(playlist.id)
    .set(playlist, { merge: true })
    .then((_: any) => console.log('liked tracks saved as a playlist'))
    .catch((error: any) => console.log(error.response.data));

  // add the liked tracks playlist & the trackIds in the user doc
  const userRef = admin.firestore().collection('users').doc(user.id);
  userRef
    .update({
      playlistIds: admin.firestore.FieldValue.arrayUnion(playlist.id),
      trackIds: admin.firestore.FieldValue.arrayUnion(...trackIds),
    })
    .then((_: any) => console.log('liked tracks playlist added on user'))
    .catch((error: any) => console.log(error.response.data));

  // write genres on playlist
  extractGenresFromTrackToPlaylist(playlist, fullTracks);
}

function extractGenresFromTrackToPlaylist(
  playlist: Playlist,
  tracks: Partial<FullTrack>[]
) {
  const playlistTracks: Partial<FullTrack>[] = tracks.filter((track) =>
    playlist.trackIds!.includes(track.id!)
  );
  const genreCollection = admin
    .firestore()
    .collection('playlists')
    .doc(playlist.id)
    .collection('genres');
  const firebaseWriteLimit = 497;
  const batchArray: any[] = [];
  batchArray.push(admin.firestore().batch());
  let operationCounter = 0;
  let batchIndex = 0;

  // extract every genres of each track
  playlistTracks.forEach((track) => {
    track.genres!.forEach((genre) => {
      const ref = genreCollection.doc(genre);
      batchArray[batchIndex].set(
        ref,
        {
          id: genre,
          trackIds: admin.firestore.FieldValue.arrayUnion(track.id),
        },
        { merge: true }
      );
      // count each db operation to avoid limit
      operationCounter += 2;

      if (operationCounter >= firebaseWriteLimit) {
        batchArray.push(admin.firestore().batch());
        batchIndex++;
        operationCounter = 0;
      }
    });
  });
  // push batch writing
  batchArray.forEach(async (batch, i, batches) => {
    await batch
      .commit()
      .then((_: any) => console.log(`batch ${i} of genres saved`))
      .catch((error: any) => console.log(error.response.data, batch));
  });
}

/// TODO: replace trackIds with a getTotalTrack function
async function getSpotifyObjectsByBatches(
  user: User,
  objectType: 'likedTracks' | 'playlists' | 'audioFeatures' | 'artists',
  ids?: string[]
): Promise<any> {
  // Playlist[] | AudioFeatures[] | Track[]
  let limit: number = 1;
  let total: number = 1;
  let url: string = '';
  let queryParam: string = '';
  let promisedResult: Promise<any[]>[] = [];
  let result: any[] = [];

  if (objectType === 'likedTracks') {
    limit = 50;
    total = await getTotalLikedTracks(user);
    url = 'https://api.spotify.com/v1/me/tracks';
  } else if (objectType === 'playlists') {
    limit = 50;
    total = await getTotalPlaylists(user);
    url = `https://api.spotify.com/v1/users/${user.spotifyId}/playlists`;
  } else if (objectType === 'audioFeatures') {
    limit = 100;
    if (ids) total = ids.length;
    url = 'https://api.spotify.com/v1/audio-features/';
  } else if (objectType === 'artists') {
    limit = 50;
    if (ids) total = ids.length;
    url = 'https://api.spotify.com/v1/artists';
  }

  for (let i = 0; i <= Math.floor(total / limit); i++) {
    const offset = i * limit;
    ids
      ? (queryParam = extractIdsAsQueryParam(limit, i, ids))
      : (queryParam = `?limit=${limit}&offset=${offset}`);

    const objectBatch = getPromisedObjects(user, url, queryParam);

    promisedResult = promisedResult.concat(objectBatch);
  }
  const arrayResult = await Promise.all(promisedResult);
  arrayResult.forEach(
    (arr) => (result = result.concat(formatObjects(arr, objectType)))
  );
  console.log('results for', objectType, 'are: ', result.length);
  return result;
}

function extractIdsAsQueryParam(
  limit: number,
  index: number,
  ids: string[]
): string {
  const bactchIds = ids.slice(limit * index, limit * (index + 1));
  let queryParam: string = '?ids=';
  // add all the trackIds
  for (const [i, id] of bactchIds.entries()) {
    // remove empty ids
    if (id !== '') queryParam += id;
    // add a coma except for the last one
    if (i < bactchIds.length - 1) queryParam += ',';
  }
  return queryParam;
}

function flatten(arr: any) {
  return arr.reduce((flat: any, next: any) => flat.concat(next), []);
}

async function getPlaylistsTracksByBatches(
  user: User,
  playlists: Playlist[]
): Promise<Track[]> {
  const playlistTracksLimit = 100;
  let totalPlaylistTracks: Track[] = [];
  // get the tracks from all playlists
  for (let m = 0; m < playlists.length; m++) {
    let promisedPlaylistTracks: Promise<Track[]>[] = [];
    // get all the playlist tracks by batches
    for (
      let l = 0;
      // l < 1;
      l <= Math.floor(playlists[m].tracks!.total / playlistTracksLimit);
      l++
    ) {
      const offset = l * playlistTracksLimit;
      const url = playlists[m].tracks!.href;
      const queryParam = `?limit=${playlistTracksLimit}&offset=${offset}`;
      const formatedTracks = getPlaylistTracks(user, url, queryParam);
      promisedPlaylistTracks = promisedPlaylistTracks.concat(formatedTracks);
    }
    const workingPlaylistTracks = await Promise.all(promisedPlaylistTracks);

    const playlistTracks: Track[] = flatten(workingPlaylistTracks);
    let trackIds = playlistTracks.map((track) => track.id!);
    playlists[m].trackIds = trackIds;
    totalPlaylistTracks = totalPlaylistTracks.concat(playlistTracks);
  }
  return totalPlaylistTracks;
}

// Get all the artists by batches to extract genres
async function getGenresByBatches(
  user: User,
  artistIds: string[]
): Promise<string[][]> {
  const artists: Artist[] = await getSpotifyObjectsByBatches(
    user,
    'artists',
    artistIds
  );
  const genres: string[][] = artists.map((artist) =>
    artist ? artist.genres! : []
  );

  return genres;
}

async function firestoreWrite(
  user: User,
  collection: any,
  objects: any[],
  type: string
) {
  // let firebaseWriteLimit: number;
  const startTime = performance.now();
  await Promise.all(
    objects.map((object: any) => {
      type === 'tracks'
        ? collection.doc(object.id).set(
            {
              ...object,
              userIds: admin.firestore.FieldValue.arrayUnion(user.id),
            },
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
}

async function getHeaders(user: User) {
  // Builds http header.
  const headers = {
    Authorization: `Bearer ${user.tokens?.access}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  return headers;
}

async function getTotalLikedTracks(user: User): Promise<number> {
  const url = 'https://api.spotify.com/v1/me/tracks';
  const queryParam = '?limit=1';

  const tracks = await getPromisedObjects(user, url, queryParam);
  return tracks.data.total;
}

async function getPlaylistTracks(
  user: User,
  url: string,
  queryParam: string
): Promise<Track[]> {
  const t = await getPromisedObjects(user, url, queryParam);
  const tracks: Track[] = [];
  t.data.items.forEach((item: SpotifyPlaylistTrack) => {
    tracks.push(
      createTrack({
        ...item.track,
        added_at: item.added_at,
        added_by: item.added_by,
      })
    );
  });
  return tracks;
}

function formatObjects(
  object: any,
  objectType: 'likedTracks' | 'playlists' | 'audioFeatures' | 'artists'
): any[] {
  let formatedObjects: any[] = [];

  if (objectType === 'playlists') formatedObjects = object.data.items;

  if (objectType === 'audioFeatures')
    formatedObjects = object.data.audio_features.map(
      (feature: SpotifyAudioFeatures) => {
        if (feature === null) return;
        return createAudioFeatures(feature);
      }
    );

  if (objectType === 'likedTracks')
    object.data.items.forEach((item: SpotifySavedTrack) => {
      formatedObjects.push(
        createTrack({
          ...item.track,
          added_at: item.added_at,
        })
      );
    });

  if (objectType === 'artists') formatedObjects = object.data.artists;

  return formatedObjects;
}

async function getTotalPlaylists(user: User): Promise<number> {
  const url = `https://api.spotify.com/v1/users/${user.spotifyId}/playlists`;
  const queryParam = '?limit=1';

  const playlists = await getPromisedObjects(user, url, queryParam);

  return playlists.data.total;
}

async function getPromisedObjects(
  user: User,
  url: string,
  queryParam: string,
  attempt?: number
): Promise<any> {
  const headers = await getHeaders(user);
  return await axios
    .get(url + queryParam, {
      headers,
    })
    .catch(async (error: any) => {
      if (error.response.status === 429) {
        if (!!!attempt || attempt! < 3) {
          attempt ? attempt++ : (attempt = 1);
          const retryAfter = (error.response.headers['retry-after'] + 1) * 1000;
          console.log('retry after: ', retryAfter, 'attempt: ', attempt);

          const delay = (ms: number) =>
            new Promise((res) => setTimeout(res, ms));

          await delay(retryAfter);
          return getPromisedObjects(user, url, queryParam, attempt);
        }
      }
    });
}
