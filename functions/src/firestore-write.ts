import admin = require('firebase-admin');
import { FullTrack, Playlist, User } from './data';

//--------------------------------
//    Saves docs to Firestore   //
//--------------------------------
export async function firestoreWrite(req: any, res: any) {
  const user: User = req.body.user;
  const collection: any = admin.firestore().collection(req.body.collection);
  const objects: any[] = req.body.objects;
  const type: string = req.body.collection;
  let response: string = '';
  const firebaseWriteLimit = 500;
  let completeBatches: any[] = [];

  const startTime = performance.now();

  for (let i = 0; i <= Math.floor(objects.length / firebaseWriteLimit); i++) {
    const bactchObjects = objects.slice(
      firebaseWriteLimit * i,
      firebaseWriteLimit * (i + 1)
    );
    const batch = admin.firestore().batch();
    for (const object of bactchObjects) {
      if (object) {
        const ref = collection.doc(object.id);
        let finalObject: any;
        // Adds userId if it's a track.
        type === 'tracks'
          ? (finalObject = {
              ...object,
              userIds: admin.firestore.FieldValue.arrayUnion(user.id),
            })
          : (finalObject = object);
        batch.set(ref, finalObject, { merge: true });
      }
    }
    completeBatches = completeBatches.concat(batch.commit());
  }

  await Promise.all(completeBatches)
    .catch((error: any) => (response = error.response))
    .then((_) => {
      response = `${objects.length + type} saved correctly to firestore.`;
    });
  res.json({
    result: response,
  });
  const endTime = performance.now();

  console.log(
    `Firestore: saved ${objects.length} ${type} in ${Number(
      (endTime - startTime) / 1000
    ).toFixed(2)} seconds.`
  );
  return res;
}

//--------------------------------------------
// Extracts genres from tracks to playlists //
//--------------------------------------------
// To enable genre filtering, genres are saved on playlists.
export async function extractGenresFromTrackToPlaylist(req: any, res: any) {
  const startTime = performance.now();

  const playlists: Playlist[] = req.body.playlists;
  const tracks: Partial<FullTrack>[] = req.body.tracks;
  let response: string = '';

  const firebaseWriteLimit = 497;
  const batchArray: FirebaseFirestore.WriteBatch[] = [];
  batchArray.push(admin.firestore().batch());
  let completeBatches: any[] = [];
  let operationCounter = 0;
  let batchIndex = 0;

  playlists.forEach((playlist) => {
    const genreCollection = admin
      .firestore()
      .collection('playlists')
      .doc(playlist.id!)
      .collection('genres');
    // Filters tracks that belong to this playlist only.
    const playlistTracks: Partial<FullTrack>[] = tracks.filter((track) =>
      playlist.trackIds!.includes(track.id!)
    );

    // Extracts every genres of each track.
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
        // Counts each db operation to stay below api limit.
        operationCounter += 2;

        // If the batch is full, adds to complete ones, creates a new one and resets operation count.
        if (operationCounter >= firebaseWriteLimit) {
          completeBatches = completeBatches.concat(
            batchArray[batchIndex].commit()
          );
          batchArray.push(admin.firestore().batch());
          batchIndex++;
          operationCounter = 0;
        }
      });
    });
  });
  // Pushes the last batch as complete.
  completeBatches = completeBatches.concat(batchArray[batchIndex].commit());

  await Promise.all(completeBatches)
    .catch((error: any) => (response = error.response))
    .then((_) => {
      response = `${batchArray.length} of genres saved correctly to firestore.`;
    });

  res.json({
    result: response,
  });
  const endTime = performance.now();

  console.log(
    `Firestore: saved ${batchArray.length} of genres in ${Number(
      (endTime - startTime) / 1000
    ).toFixed(2)} seconds.`
  );
  return res;
}
