import * as admin from 'firebase-admin';
import { FullTrack, Playlist, User } from './data';

//--------------------------------
//    SAVES DOC TO FIRESTORE    //
//--------------------------------
export async function firestoreWrite(req: any, res: any) {
  const user: User = req.body.user;
  const collection: any = admin.firestore().collection(req.body.collection);
  const objects: any[] = req.body.objects;
  const type: string = req.body.collection;
  let response: string = '';
  const firebaseWriteLimit = 500;
  let completeBatches: any[] = [];

  // Prepares batches to respect firestore write limits
  for (let i = 0; i <= Math.floor(objects.length / firebaseWriteLimit); i++) {
    const bactchObjects = objects.slice(
      firebaseWriteLimit * i,
      firebaseWriteLimit * (i + 1)
    );
    const batch = admin.firestore().batch();
    // Prepares each batch with the firestore writings
    for (const object of bactchObjects) {
      if (!object) return;
      const ref = collection.doc(object.id);
      let finalObject: any;
      // Adds userId if it's a track.
      type === 'tracks'
        ? (finalObject = {
            ...object,
            userIds: admin.firestore.FieldValue.arrayUnion(user.uid),
          })
        : (finalObject = object);
      batch.set(ref, finalObject, { merge: true });
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
  console.log(`Firestore: saved ${objects.length} ${type}. `);
  return res;
}

//--------------------------------
//     REMOVES UNUSED TRACKS    //
//--------------------------------
export async function removesUnusedTracks(req: any, res: any) {
  console.log('starting to remove unused tracks');
  const user: User = req.body.user;
  const collection: any = admin.firestore().collection('tracks');
  const trackIds: string[] = req.body.trackIds;
  let response: string = '';
  const firebaseWriteLimit = 500;
  let completeBatches: any[] = [];

  // Prepares batches to respect firestore write limits
  for (let i = 0; i <= Math.floor(trackIds.length / firebaseWriteLimit); i++) {
    const batchedTrackIds = trackIds.slice(
      firebaseWriteLimit * i,
      firebaseWriteLimit * (i + 1)
    );
    const batch = admin.firestore().batch();
    // Prepares each batch with the firestore writings
    for (const trackId of batchedTrackIds) {
      if (!trackId) return;
      const ref = collection.doc(trackId);
      batch.update(ref, {
        userIds: admin.firestore.FieldValue.arrayRemove(user.uid),
      });
    }
    completeBatches = completeBatches.concat(batch.commit());
  }
  await Promise.all(completeBatches)
    .catch((error: any) => (response = error.response))
    .then((_) => {
      response = `${trackIds.length} tracks correctly removed from user.`;
    });
  res.json({
    result: response,
  });
  console.log(`Firestore: removed ${trackIds.length} tracks from user. `);
  return res;
}

//--------------------------------------------
// EXTRACTS GENRES FROM TRACKS TO PLAYLISTS //
//--------------------------------------------
// To enable genre filtering, genres are saved on playlists.
export async function extractGenresFromTrackToPlaylist(req: any, res: any) {
  const playlists: Playlist[] = req.body.playlists;
  const tracks: Partial<FullTrack>[] = req.body.tracks;
  let response: string = '';

  const firebaseWriteLimit = 497;
  const batchArray: FirebaseFirestore.WriteBatch[] = [];
  batchArray.push(admin.firestore().batch());
  let completeBatches: any[] = [];
  let operationCounter = 0;
  let batchIndex = 0;

  playlists.forEach(async (playlist) => {
    const genreCollection = admin
      .firestore()
      .collection(`playlists/${playlist.id}/genres`);
    // Filters tracks that belong to this playlist only.
    const playlistTracks: Partial<FullTrack>[] = tracks.filter((track) =>
      playlist.trackIds!.includes(track.id!)
    );

    // Extracts every genres of each track.
    playlistTracks.forEach((track) => {
      track.genres!.forEach((genre) => {
        const ref = genreCollection.doc(genre);
        // Adds the track id to the genre within the current batch.
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
  console.log(`Firestore: saved ${batchArray.length} of genres.`);
  return res;
}

//--------------------------------
//   DELETES GENRE COLLECTIONS  //
//--------------------------------
// TODO: Use recursive logic for other batch functions
export async function deleteGenresCollection(
  req: any,
  res: any
): Promise<void> {
  const batchSize = 500;
  const playlistId: Playlist = req.body.playlistId;
  const collectionRef = admin
    .firestore()
    .collection(`playlists/${playlistId}/genres`);
  const query = collectionRef.orderBy('id').limit(batchSize);

  await new Promise((resolve, reject) => {
    deleteQueryBatch(query, resolve).catch(reject);
  });

  res.json({ result: 'ended' });
  return res;
}

async function deleteQueryBatch(
  query: FirebaseFirestore.Query<FirebaseFirestore.DocumentData>,
  resolve: any
) {
  const snapshot = await query.get();

  const batchSize = snapshot.size;
  if (batchSize === 0) {
    // When there are no documents left, we are done
    resolve();
    return;
  }

  // Deletes documents in a batch
  const batch = admin.firestore().batch();
  snapshot.docs.forEach((doc) => {
    batch.delete(doc.ref);
  });
  await batch.commit();

  // Recurses on the next process tick, to avoid
  // exploding the stack.
  process.nextTick(() => {
    deleteQueryBatch(query, resolve);
  });
}

//--------------------------------
//   CREATES FIREBASE ACCOUNT   //
//--------------------------------
export async function createFirebaseAccount(
  uid: string,
  displayName: string,
  email: string
): Promise<string> {
  const userDoc = await admin.firestore().collection('users').doc(uid).get();
  let playlistIds: string[] = [];
  if (userDoc.exists)
    if (userDoc.data()!.playlistIds) playlistIds = userDoc.data()!.playlistIds;
  const dbTask = admin.firestore().collection('users').doc(uid).set(
    {
      uid,
      displayName,
      email,
      playlistIds,
    },
    { merge: true }
  );
  // Creates or update the user account.
  const authTask = admin
    .auth()
    .updateUser(uid, {
      displayName,
      email,
    })
    .catch((error) => {
      // If user does not exists we create it.
      if (error.code === 'auth/user-not-found') {
        return admin.auth().createUser({
          uid,
          displayName,
          email,
        });
      }
      throw error;
    });
  // Waits for all async tasks to complete, then generate and return a custom auth token.
  await Promise.all([dbTask, authTask]);

  // Creates a Firebase custom auth token.
  const custom_auth_token = await admin.auth().createCustomToken(uid);

  return custom_auth_token;
}
