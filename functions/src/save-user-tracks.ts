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

  // Gets user's playlists.
  const startTimeGetPlaylist = performance.now();
  let playlists: Playlist[] = await getSpotifyObjectsByBatches(
    user,
    'playlists'
  );
  const endTimeGetPlaylist = performance.now();
  console.log(
    `Playlists: get ${playlists.length} playlists in ${Number(
      (endTimeGetPlaylist - startTimeGetPlaylist) / 1000
    ).toFixed(2)} seconds.`
  );

  // Gets user's tracks.
  const trackCall = await getUserPlaylistFullTracks(user, playlists);
  const fullTracks = trackCall.tracks;

  // Adds liked tracks to the playlists.
  playlists = playlists.concat(trackCall.likedTrackPlaylist);

  // Writes playlists to Firestore.
  axios({
    headers: {
      'Content-Type': 'application/json',
    },
    url: 'http://localhost:5001/listy-bcc65/us-central1/firestoreWrite',
    data: {
      user,
      collection: 'playlists',
      objects: playlists,
    },
    method: 'POST',
  }).catch((error: any) => console.log(error.response.data));

  // Writes tracks to Firestore.
  axios({
    headers: {
      'Content-Type': 'application/json',
    },
    url: 'http://localhost:5001/listy-bcc65/us-central1/firestoreWrite',
    data: {
      user,
      collection: 'tracks',
      objects: fullTracks,
    },
    method: 'POST',
  }).catch((error: any) => console.log(error.response.data));
  /*
  // write playlist ids & track ids in user doc
  const userRef = admin.firestore().collection('users').doc(user.id);
  const playlistIds = playlists.map((playlist) => playlist.id);
  const trackIds: string[] = fullTracks.map((track) => track.id!);
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

  console.log(
    `Total: Saving user's tracks and playlists took ${Number(
      (endTime - startTime) / 1000
    ).toFixed(2)} seconds.`
  );
  return fullTracks;
}

async function getUserPlaylistFullTracks(
  user: User,
  playlists: Playlist[]
): Promise<{
  tracks: Partial<FullTrack>[];
  likedTrackPlaylist: Playlist;
}> {
  // Gets liked tracks.
  const startTimeGetLikedTracks = performance.now();
  const likedTracks: Track[] = (await getSpotifyObjectsByBatches(
    user,
    'likedTracks'
  )) as Track[];

  const endTimeGetLikedTracks = performance.now();
  console.log(
    `Liked tracks: get ${likedTracks.length} tracks in ${Number(
      (endTimeGetLikedTracks - startTimeGetLikedTracks) / 1000
    ).toFixed(2)} seconds.`
  );
  const likedTrackIds: string[] = likedTracks.map((track) => track.id!);

  // Creates liked tracks as a playlist.
  const likedTrackPlaylist: Playlist = {
    id: `${user.id}LikedTracks`,
    name: `Liked tracks`,
    trackIds: likedTrackIds,
    type: 'likedTracks',
  };

  // Extracts tracks from playlists and adds trackIds to playlists.
  const startTimeGetTracks = performance.now();
  const playlistTracks = await getPlaylistsTracksAndAddTrackIdsToPlaylists(
    user,
    playlists
  );
  const endTimeGetTracks = performance.now();
  console.log(
    `Playlist tracks: get ${playlistTracks.length} tracks in ${Number(
      (endTimeGetTracks - startTimeGetTracks) / 1000
    ).toFixed(2)} seconds.`
  );
  // Joins liked tracks to playlists tracks.
  const tracks = likedTracks.concat(playlistTracks);

  // Removes track duplicates and extracts ids.
  const uniqueTracks = tracks.filter(
    (track: Track, index: number, trackArray: Track[]) =>
      index === trackArray.findIndex((t) => t.id === track.id)
  );
  const trackIds: string[] = uniqueTracks.map((track) => track.id!);
  console.log(
    `Total tracks: ${tracks.length} tracks, ${uniqueTracks.length} unique tracks.`
  );

  // Gets audio features for each tracks.
  const startTimeGetAudioFeatures = performance.now();
  const audioFeatures = await getSpotifyObjectsByBatches(
    user,
    'audioFeatures',
    undefined,
    trackIds
  );
  const endTimeGetAudioFeatures = performance.now();
  console.log(
    `Audio features: get ${audioFeatures.length} audio features in ${Number(
      (endTimeGetAudioFeatures - startTimeGetAudioFeatures) / 1000
    ).toFixed(2)} seconds.`
  );

  // Gets artists for each track and extracts genres from it.
  const genres = await getGenreTracks(user, uniqueTracks);

  // Concats all items into one track.
  const fullTracks: Partial<FullTrack>[] = uniqueTracks.map((track, i) => ({
    ...track,
    ...audioFeatures[i],
    genres: genres[i],
  }));

  return {
    tracks: fullTracks,
    likedTrackPlaylist,
  };
}

async function getGenreTracks(
  user: User,
  tracks: Track[]
): Promise<string[][]> {
  const emptyArtistPosition: number[] = [];
  // add empty string when no artist
  const artistIds: string[] = tracks.map((track, i) => {
    if (track.artists![0].id) {
      return track.artists![0].id;
    } else {
      emptyArtistPosition.push(i);
      return '';
    }
  });

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

  const endTimeGetGenres = performance.now();
  console.log(
    `Artists & genres: get ${artists.length} artists and genres in ${Number(
      (endTimeGetGenres - startTimeGetGenres) / 1000
    ).toFixed(2)} seconds.`
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

  // console.log('results for', objectType, 'are: ', result.length);
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

async function getPlaylistsTracksAndAddTrackIdsToPlaylists(
  user: User,
  playlists: Playlist[]
): Promise<Track[]> {
  let totalPlaylistTracks: Track[] = [];
  // Extracts tracks from each playlist.
  for (let m = 0; m < playlists.length; m++) {
    const playlistTracks: Track[] = await getSpotifyObjectsByBatches(
      user,
      'playlistTracks',
      playlists[m]
    );
    let trackIds = playlistTracks.map((track) => track.id!);
    // Adds trackids to the playlist.
    playlists[m].trackIds = trackIds;
    totalPlaylistTracks = totalPlaylistTracks.concat(playlistTracks);
  }
  return totalPlaylistTracks;
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
          console.log(
            `API call blocked because of rate limit. Call will be retried in ${
              retryAfter / 1000
            }s, attempt n°${attempt}.`
          );

          await delay(retryAfter);
          return getPromisedObjects(user, url, queryParam, attempt);
        }
      }
    });
}
