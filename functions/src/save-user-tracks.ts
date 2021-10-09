import {
  Artist,
  createAudioFeatures,
  Playlist,
  SpotifyAudioFeatures,
  SpotifyPlaylistTrack,
  Track,
  User,
  createTrack,
  SpotifySavedTrack,
} from './data';
const admin = require('firebase-admin');
const axios = require('axios').default;

// TODO: replace user with userId
export async function saveUserPlaylists(data: any) {
  const user = data.user;
  const startTime = performance.now();
  console.log(startTime);
  // get active user's playlists by batches
  const startTimeGetPlaylist = performance.now();

  const playlists: Playlist[] = await getActiveUserPlaylistsByBatches(user);
  const endTimeGetPlaylist = performance.now();
  console.log(
    `Call to GetPlaylist took ${
      endTimeGetPlaylist - startTimeGetPlaylist
    } milliseconds`
  );

  // extract the tracks from the playlists
  const startTimeGetTracks = performance.now();

  const tracks = await getPlaylistsTracksByBatches(user, playlists);
  const endTimeGetTracks = performance.now();
  console.log(
    `Call to GetTracks took ${
      endTimeGetTracks - startTimeGetTracks
    } milliseconds`
  );
  // Get audio features
  const trackIds: string[] = tracks.map((track) => track.id);
  const startTimeGetAudioFeatures = performance.now();

  const audioFeatures = await getAudioFeaturesByBatches(user, trackIds);
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
    if (track.artists![0].id) {
      return track.artists![0].id;
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

  const genres = await getGenresByBatches(user, artistIds);
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
  const playlistCollection = admin.firestore().collection('playlists');
  await firestoreWriteBatches(user, playlistCollection, playlists, 'playlists');
  console.log('playlist tracks: ', fullTracks);
  // write tracks by batches
  const trackCollection = admin.firestore().collection('tracks');
  await firestoreWriteBatches(user, trackCollection, fullTracks, 'tracks');

  // write playlist ids & track ids in user doc
  const userRef = admin.firestore().collection('users').doc(user.id);
  const playlistIds = playlists.map((playlist) => playlist.id);
  userRef
    .update({ playlistIds, trackIds })
    .then((_: any) => console.log('playlistIds saved on user'))
    .catch((error: any) => console.log(error));

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

async function saveUserLikedTracks(user: User) {
  // TODO: refactor code with a getFullTracks function
  // get liked tracks by batches
  const tracks: Track[] = await getLikedTracksByBatches(user);
  const trackIds: string[] = tracks.map((track) => track.id);
  // Get audio features by batches
  const audioFeatures: Track[] = await getAudioFeaturesByBatches(
    user,
    trackIds
  );
  // Get genres
  const artistIds: string[] = tracks.map((track) => track.artists![0].id);
  const genres = await getGenresByBatches(user, artistIds);

  // concat all items into one track
  const fullTracks: Track[] = tracks.map((track, i) => ({
    ...track,
    ...audioFeatures[i],
    genres: genres[i],
  }));

  console.log('liked tracks: ', fullTracks);

  // write tracks by batches
  const trackCollection = admin.firestore().collection('tracks');
  await firestoreWriteBatches(user, trackCollection, fullTracks, 'tracks');

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
    .catch((error: any) => console.log(error));

  // add the liked tracks playlist & the trackIds in the user doc
  const userRef = admin.firestore().collection('users').doc(user.id);
  userRef
    .update({
      playlistIds: admin.firestore().FieldValue.arrayUnion(playlist.id),
      trackIds: admin.firestore().FieldValue.arrayUnion(...trackIds),
    })
    .then((_: any) => console.log('liked tracks playlist added on user'))
    .catch((error: any) => console.log(error));

  // write genres on playlist
  extractGenresFromTrackToPlaylist(playlist, fullTracks);
}

function extractGenresFromTrackToPlaylist(playlist: Playlist, tracks: Track[]) {
  const playlistTracks: Track[] = tracks.filter((track) =>
    playlist.trackIds!.includes(track.id)
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
          trackIds: admin.firestore().FieldValue.arrayUnion(track.id),
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
      .catch((error: any) => console.log(error, batch));
  });
}

async function getLikedTracksByBatches(user: User): Promise<Track[]> {
  const likedTracksLimit = 50;
  const total: number = await getTotalLikedTracks(user);
  let tracks: Track[] = [];
  for (let j = 0; j <= Math.floor(total / likedTracksLimit) + 1; j++) {
    const offset = j * likedTracksLimit;
    const url = 'https://api.spotify.com/v1/me/tracks';
    const queryParam = `?limit=${likedTracksLimit}&offset=${offset}`;
    const formatedTracks = await getLikedTracks(user, url, queryParam);

    tracks = tracks.concat(formatedTracks);
  }
  return tracks;
}

async function getActiveUserPlaylistsByBatches(
  user: User
): Promise<Playlist[]> {
  const playlistLimit = 50;
  const total = await getTotalPlaylists(user);

  let playlists: Playlist[] = [];
  for (let j = 0; j <= Math.floor(total / playlistLimit) + 1; j++) {
    const offset = j * playlistLimit;
    const url = `https://api.spotify.com/v1/users/${user.spotifyId}/playlists`;
    const queryParam = `?limit=${playlistLimit}&offset=${offset}`;

    const lists = await getPlaylists(user, url, queryParam);

    playlists = playlists.concat(lists);
  }
  return playlists;
}

async function getPlaylistsTracksByBatches(
  user: User,
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
      l <= Math.floor(playlists[m].tracks!.total / playlistTracksLimit) + 1;
      l++
    ) {
      const offset = l * playlistTracksLimit;
      const url = playlists[m].tracks!.href;
      const queryParam = `?limit=${playlistTracksLimit}&offset=${offset}`;
      const formatedTracks = await getPlaylistTracks(user, url, queryParam);

      playlistTracks = playlistTracks.concat(formatedTracks);
    }
    let trackIds = playlistTracks.map((track) => track.id);
    playlists[m].trackIds = trackIds;
    totalPlaylistTracks = totalPlaylistTracks.concat(playlistTracks);
  }
  return totalPlaylistTracks;
}

async function getAudioFeaturesByBatches(
  user: User,
  trackIds: string[]
): Promise<Track[]> {
  let audioFeatures: Track[] = [];
  const audioFeaturesLimit = 100;

  for (let i = 0; i <= Math.floor(trackIds.length / audioFeaturesLimit); i++) {
    const bactchTrackIds = trackIds.slice(
      audioFeaturesLimit * i,
      audioFeaturesLimit * (i + 1)
    );

    const formatedFeatures = await getAudioFeatures(user, bactchTrackIds);
    audioFeatures = audioFeatures.concat(formatedFeatures);
  }

  return audioFeatures;
}

// Get all the artists by batches to extract genres
async function getGenresByBatches(
  user: User,
  artistIds: string[]
): Promise<string[][]> {
  const artistLimit = 50;
  let totalGenres: string[][] = [];
  for (let i = 0; i <= Math.floor(artistIds.length / artistLimit); i++) {
    const bactchArtistIds = artistIds.slice(
      artistLimit * i,
      artistLimit * (i + 1)
    );
    const artists = await getArtists(user, bactchArtistIds);
    let genres: string[][];
    if (artists) {
      genres = artists.map((artist) => (artist ? artist.genres! : []));

      // handle errors by returning empty genres
    } else {
      genres = Array.from(Array(bactchArtistIds.length), () => []);
    }

    totalGenres = totalGenres.concat(genres);
  }
  return totalGenres;
}

async function firestoreWriteBatches(
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
              userIds: admin.firestore().FieldValue.arrayUnion(user.id),
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

  // tracks write twice, including userId
  /*   type === 'tracks' ? (firebaseWriteLimit = 250) : (firebaseWriteLimit = 500);
    const userId =  authQuery.getActiveId();
    for (let i = 0; i <= Math.floor(objects.length / firebaseWriteLimit); i++) {
      const bactchObject = objects.slice(
        firebaseWriteLimit * i,
        firebaseWriteLimit * (i + 1)
      );
      const batch =   admin.firestore().batch();

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

async function getHeaders(user: User) {
  // Builds http header.
  const headers = {
    Authorization: `Bearer ${user.tokens?.access}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  return headers;
}

async function getLikedTracks(
  user: User,
  url: string,
  queryParam: string
): Promise<Track[]> {
  const tracks = await getPromisedObjects(user, url, queryParam);
  return tracks.map((tracks: { items: SpotifySavedTrack[] }) =>
    tracks.items.map((item) =>
      // TODO: remove added_at from track
      createTrack({
        added_at: item.added_at,
        ...item.track,
      })
    )
  );
}

async function getTotalLikedTracks(user: User): Promise<number> {
  const url = 'https://api.spotify.com/v1/me/tracks';
  const queryParam = '?limit=1';

  const tracks = await getPromisedObjects(user, url, queryParam);
  return tracks.total;
}

async function getPlaylistTracks(
  user: User,
  url: string,
  queryParam: string
): Promise<Track[]> {
  const tracks = await getPromisedObjects(user, url, queryParam);
  return tracks.map((playlistTracks: { items: SpotifyPlaylistTrack[] }) =>
    playlistTracks.items.map((item) =>
      createTrack({
        added_at: item.added_at,
        added_by: item.added_by,
        ...item.track,
      })
    )
  );
}

async function getPlaylists(
  user: User,
  url: string,
  queryParam: string
): Promise<Playlist[]> {
  const playlists = await getPromisedObjects(user, url, queryParam);
  return playlists.map((paging: { items: Playlist[] }) => paging.items);
}

async function getTotalPlaylists(user: User): Promise<number> {
  const url = `https://api.spotify.com/v1/users/${user.spotifyId}/playlists`;
  const queryParam = '?limit=1';

  const playlists = await getPromisedObjects(user, url, queryParam);

  return playlists.total;
}

async function getAudioFeatures(
  user: User,
  trackIds: string[]
): Promise<Track[]> {
  const url = 'https://api.spotify.com/v1/audio-features/';
  let queryParam: string = '?ids=';
  // add all the trackIds
  for (const trackId of trackIds) {
    queryParam = queryParam + trackId + ',';
  }
  // remove last comma
  queryParam = queryParam.substring(0, queryParam.length - 1);

  const audioFeatures = await getPromisedObjects(user, url, queryParam);

  return audioFeatures.map(
    (audioFeat: { audio_features: SpotifyAudioFeatures[] }) =>
      audioFeat.audio_features.map((feature) => {
        if (feature === null) {
          return;
        }
        return createAudioFeatures(feature);
      })
  );
}

async function getArtists(user: User, artistIds: string[]): Promise<Artist[]> {
  const url = 'https://api.spotify.com/v1/artists';
  let queryParam: string = '?ids=';
  for (const artistId of artistIds) {
    // handle empty artist
    if (artistId !== '') queryParam = queryParam + artistId + ',';
  }
  queryParam = queryParam.substring(0, queryParam.length - 1);

  const artists = await getPromisedObjects(user, url, queryParam);
  artists.map((artists: { artists: Artist[] }) => {
    return artists.artists;
  });
  return artists;
}

async function getPromisedObjects(
  user: User,
  url: string,
  queryParam: string
): Promise<any> {
  const headers = await getHeaders(user);
  return await axios.get(url + queryParam, {
    headers,
  });
}
