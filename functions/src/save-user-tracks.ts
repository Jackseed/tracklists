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
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
const axios = require('axios').default;

//--------------------------------
//        MAIN FUNCTION         //
//--------------------------------
// TODO: replace user with userId
export async function saveUserTracks(data: any) {
  const user = data.user;

  const userTrackDocs = await admin
    .firestore()
    .collection('tracks')
    .where('userIds', 'array-contains', user.id)
    .get();
  const firebaseUserTrackIds = userTrackDocs.docs.map((doc) => doc.data().id);

  // Gets user's playlists.
  let playlists: Playlist[] = await getSpotifyObjectsByBatches(
    user,
    'playlists'
  );
  console.log(`Playlists: get ${playlists.length} playlists.`);

  // Gets user's Spotify tracks.
  const trackCall = await getUserPlaylistFullTracks(user, playlists);
  const uniqueFullTracks = trackCall.tracks;
  const spotifyUserTrackIds = uniqueFullTracks.map((track) => track.id);

  // Gets tracks saved to Firebase but removed from Spotify
  const removedTrackIds = firebaseUserTrackIds.filter(
    (id) => !spotifyUserTrackIds.includes(id)
  );

  if (removedTrackIds.length > 0) {
    console.log(
      'Firebase length: ',
      firebaseUserTrackIds.length,
      'Spotify length: ',
      spotifyUserTrackIds.length,
      'tracks to remove: ',
      removedTrackIds.length
    );
    // Removes unused tracks
    axios({
      headers: {
        'Content-Type': 'application/json',
      },
      url: functions.config().functions.removesunusedtracks,
      data: {
        user,
        trackIds: removedTrackIds,
      },
      method: 'POST',
    });

    // Deletes genre collections because of unused tracks
    playlists.forEach((playlist) =>
      axios({
        headers: {
          'Content-Type': 'application/json',
        },
        url: functions.config().functions.deletegenrescollection,
        data: {
          playlistId: playlist.id,
        },
        method: 'POST',
      })
    );
  }
  // Adds liked tracks to the playlists.
  playlists = playlists.concat(trackCall.likedTrackPlaylist);

  // Writes playlists to Firestore.
  axios({
    headers: {
      'Content-Type': 'application/json',
    },
    url: functions.config().functions.firestorewrite,
    data: {
      user,
      collection: 'playlists',
      objects: playlists,
    },
    method: 'POST',
  });

  // Writes tracks to Firestore.
  axios({
    headers: {
      'Content-Type': 'application/json',
    },
    url: functions.config().functions.firestorewrite,
    data: {
      user,
      collection: 'tracks',
      objects: uniqueFullTracks,
    },
    method: 'POST',
  });

  // Writes playlist & track ids in user doc.
  const userRef = admin.firestore().collection('users').doc(user.uid);
  const playlistIds = playlists.map((playlist) => playlist.id);
  const uniqueTrackIds: string[] = uniqueFullTracks.map((track) => track.id!);

  await userRef
    .update({ playlistIds, trackIds: uniqueTrackIds })
    .then((_: any) =>
      console.log('Firestore: track & playlist ids saved on user.')
    )
    .catch((error: any) => console.log(error));

  // Writes genres on playlists to enable genre filtering.
  axios({
    headers: {
      'Content-Type': 'application/json',
    },
    url: functions.config().functions.extractgenresfromtracktoplaylist,
    data: {
      playlists,
      tracks: uniqueFullTracks,
    },
    method: 'POST',
  });

  return uniqueFullTracks;
}

//--------------------------------
//       GET FULL TRACKS        //
//--------------------------------
async function getUserPlaylistFullTracks(
  user: User,
  playlists: Playlist[]
): Promise<{
  tracks: Partial<FullTrack>[];
  likedTrackPlaylist: Playlist;
}> {
  // Gets liked tracks.
  const likedTracks: Track[] = (await getSpotifyObjectsByBatches(
    user,
    'likedTracks'
  )) as Track[];

  console.log(`Liked tracks: get ${likedTracks.length} tracks.`);
  const likedTrackIds: string[] = likedTracks.map((track) => track.id!);

  // Creates liked tracks as a playlist.
  const likedTrackPlaylist: Playlist = {
    id: `${user.uid}LikedTracks`,
    name: `Liked tracks`,
    trackIds: likedTrackIds,
    type: 'likedTracks',
  };

  // Extracts tracks from playlists and adds trackIds to playlists.
  const playlistTracks = await getPlaylistsTracksAndAddTrackIdsToPlaylists(
    user,
    playlists
  );
  console.log(`Playlist tracks: get ${playlistTracks.length} tracks.`);

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
  const audioFeatures = await getSpotifyObjectsByBatches(
    user,
    'audioFeatures',
    undefined,
    trackIds
  );
  console.log(`Audio features: get ${audioFeatures.length} audio features.`);

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

//--------------------------------
//     GET FULL TRACKS UTILS    //
//--------------------------------
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

async function getGenreTracks(
  user: User,
  tracks: Track[]
): Promise<string[][]> {
  const emptyArtistPosition: number[] = [];
  // Adds empty string as id when there is no artist.
  const artistIds: string[] = tracks.map((track, i) => {
    if (track.artists![0].id) {
      return track.artists![0].id;
    } else {
      emptyArtistPosition.push(i);
      return '';
    }
  });
  // Gets artists.
  const artists: Artist[] = await getSpotifyObjectsByBatches(
    user,
    'artists',
    undefined,
    artistIds
  );
  console.log(`Artists & genres: get ${artists.length} artists and genres.`);

  // Extracts genres from artists.
  const genres: string[][] = artists.map((artist) =>
    artist ? artist.genres! : []
  );

  // Adds empty genres when there is no artist.
  for (const position of emptyArtistPosition) {
    genres.splice(position, 0, []);
  }

  return genres;
}

//--------------------------------
//         GET FACTORY          //
//--------------------------------

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
    url = `https://api.spotify.com/v1/users/${user.uid}/playlists`;
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
    // Paralelize calls only for playlistTracks to avoid Spotify api rate limit.
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

  return result;
}

//--------------------------------
//        GET FACTORY UTILS     //
//--------------------------------
async function getTotalLikedTracks(user: User): Promise<number> {
  const url = 'https://api.spotify.com/v1/me/tracks';
  const queryParam = '?limit=1';

  const tracks = await getPromisedObjects(user, url, queryParam);
  return tracks.data.total;
}

async function getTotalPlaylists(user: User): Promise<number> {
  const url = `https://api.spotify.com/v1/users/${user.uid}/playlists`;
  const queryParam = '?limit=1';

  const playlists = await getPromisedObjects(user, url, queryParam);

  return playlists.data.total;
}

function extractIdsAsQueryParam(
  limit: number,
  index: number,
  ids: string[]
): string {
  const bactchIds = ids.slice(limit * index, limit * (index + 1));
  let queryParam: string = '?ids=';
  // Adds all the trackIds.
  for (const [i, id] of bactchIds.entries()) {
    // Removes empty ids.
    if (id !== '') queryParam += id;
    // Adds a coma except for the last one.
    if (i < bactchIds.length - 1) queryParam += ',';
  }
  return queryParam;
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

//--------------------------------
//          HTTP CALLS          //
//--------------------------------

async function getHeaders(user: User) {
  // Builds http header.
  const headers = {
    Authorization: `Bearer ${user.tokens?.access}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  return headers;
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
    // Retries the call after a delay if it was blocked by api rate limit.
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
