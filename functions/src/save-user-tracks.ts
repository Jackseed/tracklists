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
} from './data';
// const admin = require('firebase-admin');
const axios = require('axios').default;

// TODO: replace user with userId
export async function saveUserTracks(data: any) {
  const startTime = performance.now();
  const user = data.user;

  // get active user's playlists by batches
  const startTimeGetPlaylist = performance.now();
  let playlists: Playlist[] = await getSpotifyObjectsByBatches(
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
  const trackCall = await getUserPlaylistFullTracks(user, playlists);
  const fullTracks = trackCall.tracks;
  // add liked tracks as a playlist
  playlists = playlists.concat(trackCall.likedTrackPlaylist);
  /*
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
  await userRef
    .update({ playlistIds, trackIds })
    .then((_: any) => console.log('playlistIds saved on user'))
    .catch((error: any) => console.log(error.response.data));
 */
  // write genres on playlists
  /*   const startTimeExtractGenresTrackToPlaylist = performance.now();

  playlists.forEach((playlist) =>
    extractGenresFromTrackToPlaylist(playlist, fullTracks)
  );
  const endTimeExtractGenresTrackToPlaylist = performance.now();
  console.log(
    `Call to ExtractGenresTrackToPlaylist took ${
      endTimeExtractGenresTrackToPlaylist -
      startTimeExtractGenresTrackToPlaylist
    } milliseconds`
  ); */

  const endTime = performance.now();

  console.log(`Call to savePlaylist took ${endTime - startTime} milliseconds`);
  return fullTracks;
}

async function getUserPlaylistFullTracks(
  user: User,
  playlists: Playlist[]
): Promise<{
  tracks: Partial<FullTrack>[];
  likedTrackPlaylist: Playlist;
}> {
  // get liked tracks by batches
  const startTimeGetLikedTracks = performance.now();
  const likedTracks: Track[] = (await getSpotifyObjectsByBatches(
    user,
    'likedTracks'
  )) as Track[];
  console.log('liked track amount: ', likedTracks.length);
  const endTimeGetLikedTracks = performance.now();
  console.log(
    `Call to GetLikedTracks took ${
      endTimeGetLikedTracks - startTimeGetLikedTracks
    } milliseconds`
  );
  const likedTrackIds: string[] = likedTracks.map((track) => track.id!);
  // create liked tracks as a playlist
  const likedTrackPlaylist: Playlist = {
    id: `${user.id}LikedTracks`,
    name: `Liked tracks`,
    trackIds: likedTrackIds,
    type: 'likedTracks',
  };

  // extract the tracks from the playlists
  const startTimeGetTracks = performance.now();
  const playlistTracks = await getPlaylistsTracks(user, playlists);
  console.log('playlist track amount: ', playlistTracks.length);
  const endTimeGetTracks = performance.now();
  console.log(
    `Call to GetTracks took ${
      endTimeGetTracks - startTimeGetTracks
    } milliseconds`
  );
  // add playlist tracks to liked tracks
  const tracks = likedTracks.concat(playlistTracks);

  // Get audio features
  const trackIds: string[] = tracks.map((track) => track.id!);

  const startTimeGetAudioFeatures = performance.now();

  const audioFeatures = await getSpotifyObjectsByBatches(
    user,
    'audioFeatures',
    undefined,
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

  console.log('full tracks amount: ', fullTracks.length);

  return {
    tracks: fullTracks,
    likedTrackPlaylist,
  };
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
  const artists: Artist[] = await getSpotifyObjectsByBatches(
    user,
    'artists',
    undefined,
    artistIds
  );
  const genres: string[][] = artists.map((artist) =>
    artist ? artist.genres! : []
  );

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
/*
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
} */

async function getSpotifyObjectsByBatches(
  user: User,
  objectType:
    | 'likedTracks'
    | 'playlists'
    | 'audioFeatures'
    | 'artists'
    | 'playlistTracks',
  playlist?: Playlist,
  ids?: string[]
): Promise<any> {
  let limit: number = 1;
  let total: number = 1;
  let url: string = '';
  let queryParam: string = '';
  let promisedResult: Promise<any[]>[] = [];
  let result: any[] = [];
  let objectBatch: any[] | Promise<any[]> = [];

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
  } else if (objectType === 'playlistTracks') {
    limit = 100;
    if (playlist) total = playlist.tracks!.total;
    if (playlist) url = playlist.tracks!.href;
  }

  for (let i = 0; i <= Math.floor(total / limit); i++) {
    const offset = i * limit;
    ids
      ? (queryParam = extractIdsAsQueryParam(limit, i, ids))
      : (queryParam = `?limit=${limit}&offset=${offset}`);
    // paralelize calls only for playlistTracks to avoid Spotify api rate limit
    if (objectType === 'playlistTracks') {
      objectBatch = getPromisedObjects(user, url, queryParam);
      promisedResult = promisedResult.concat(objectBatch);
    } else {
      objectBatch = await getPromisedObjects(user, url, queryParam);
      const formatedObject = formatObjects(objectBatch, objectType);
      result = result.concat(formatedObject);
    }
  }
  if (objectType === 'playlistTracks') {
    const arrayResult = await Promise.all(promisedResult);
    arrayResult.forEach(
      (arr) => (result = result.concat(formatObjects(arr, objectType)))
    );
  }


  console.log('results for', objectType, 'are: ', result.length);
  return result;
}

// cut promises into batches of 10 call per second to respect Spotify API rate limit
/* async function promiseAllInBatches(items: any[]): Promise<any[][]> {
  const batchSize = 20;
  let position = 0;
  let results: any[] = [];
  while (position < items.length) {
    const startTime = performance.now();
    const itemsForBatch = items.slice(position, position + batchSize);
    results = [...results, ...(await Promise.all(itemsForBatch))];
    position += batchSize;
    await delay(1000);
    const endTime = performance.now();
    console.log(`Call to blabla took ${endTime - startTime} milliseconds`);
  }
  return results;
} */

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

/* function flatten(arr: any) {
  return arr.reduce((flat: any, next: any) => flat.concat(next), []);
} */

async function getPlaylistsTracks(
  user: User,
  playlists: Playlist[]
): Promise<Track[]> {
  let totalPlaylistTracks: Track[] = [];
  // get the tracks from all playlists
  for (let m = 0; m < playlists.length; m++) {
    // get all the playlist tracks by batches
    const playlistTracks: Track[] = await getSpotifyObjectsByBatches(
      user,
      'playlistTracks',
      playlists[m]
    );
    let trackIds = playlistTracks.map((track) => track.id!);
    playlists[m].trackIds = trackIds;
    totalPlaylistTracks = totalPlaylistTracks.concat(playlistTracks);
  }
  return totalPlaylistTracks;
}
/*
async function firestoreWrite(
  user: User,
  collection: any,
  objects: any[],
  type: string
) {
  // let firebaseWriteLimit: number;
  console.log(objects.length);
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
  )
    .catch((error: any) => console.log(error.response))
    .then((_) => {
      const endTime = performance.now();

      console.log(
        `Call to firestoreWriteBatches ${type} took ${
          endTime - startTime
        } milliseconds`
      );
    });
} */

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

function formatObjects(
  object: any,
  objectType:
    | 'likedTracks'
    | 'playlists'
    | 'audioFeatures'
    | 'artists'
    | 'playlistTracks'
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

  if (objectType === 'playlistTracks')
    object.data.items.forEach((item: SpotifyPlaylistTrack) => {
      formatedObjects.push(
        createTrack({
          ...item.track,
          added_at: item.added_at,
          added_by: item.added_by,
        })
      );
    });

  return formatedObjects;
}

async function getTotalPlaylists(user: User): Promise<number> {
  const url = `https://api.spotify.com/v1/users/${user.spotifyId}/playlists`;
  const queryParam = '?limit=1';

  const playlists = await getPromisedObjects(user, url, queryParam);

  return playlists.data.total;
}

function delay(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
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

          await delay(retryAfter);
          return getPromisedObjects(user, url, queryParam, attempt);
        }
      }
    });
}
