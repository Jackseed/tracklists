import admin = require('firebase-admin');
import { User } from './data';

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
      const endTime = performance.now();

      console.log(
        `Firestore: saved ${objects.length} ${type} in ${Number(
          (endTime - startTime) / 1000
        ).toFixed(2)} seconds.`
      );
      response = `${objects.length + type} saved correctly to firestore.`;
    });
  res.json({
    result: response,
  });
  return res;
}
