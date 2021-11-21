import functions = require('firebase-functions');
import { saveUserTracks } from './save-user-tracks';
import { getSpotifyToken, saveToken } from './spotify-auth';
import {
  extractGenresFromTrackToPlaylist,
  firestoreWrite,
} from './firestore-write';

const admin = require('firebase-admin');
admin.initializeApp({
  serviceAccountId:
    'firebase-adminsdk-zyazz@listy-bcc65.iam.gserviceaccount.com',
});

//--------------------------------
//    GETS SPOTIFY AUTH TOKEN   //
//--------------------------------
exports.getSpotifyToken = functions
  .runWith({ timeoutSeconds: 500 })
  .https.onCall(getSpotifyToken);

//--------------------------------
//   SAVES SPOTIFY AUTH TOKEN   //
//--------------------------------
exports.saveToken = functions
  .runWith({ timeoutSeconds: 60 })
  .https.onRequest(saveToken);

//--------------------------------
//     SAVES USER PLAYLISTS     //
//--------------------------------
exports.saveUserPlaylists = functions
  .runWith({ timeoutSeconds: 500 })
  .https.onCall(saveUserTracks);

//--------------------------------
//    SAVES DOC TO FIRESTORE   //
//--------------------------------
exports.firestoreWrite = functions
  .runWith({
    timeoutSeconds: 500,
  })
  .https.onRequest(firestoreWrite);

//--------------------------------------------
// EXTRACTS GENRES FROM TRACKS TO PLAYLISTS //
//--------------------------------------------
exports.extractGenresFromTrackToPlaylist = functions
  .runWith({
    timeoutSeconds: 500,
  })
  .https.onRequest(extractGenresFromTrackToPlaylist);
