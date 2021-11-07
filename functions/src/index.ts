import functions = require('firebase-functions');
import { saveUserTracks } from './save-user-tracks';
import { getSpotifyToken, saveToken } from './spotify-auth';
import {
  extractGenresFromTrackToPlaylist,
  firestoreWrite,
} from './firestore-write';

const admin = require('firebase-admin');
admin.initializeApp();

exports.getSpotifyToken = functions
  .runWith({ timeoutSeconds: 500 })
  .https.onCall(getSpotifyToken);

exports.saveToken = functions
  .runWith({ timeoutSeconds: 60 })
  .https.onRequest(saveToken);

exports.saveUserPlaylists = functions
  .runWith({ timeoutSeconds: 500 })
  .https.onCall(saveUserTracks);

//--------------------------------
//    Saves docs to Firestore   //
//--------------------------------
exports.firestoreWrite = functions
  .runWith({
    timeoutSeconds: 500,
  })
  .https.onRequest(firestoreWrite);

//--------------------------------------------
// Extracts genres from tracks to playlists //
//--------------------------------------------
exports.extractGenresFromTrackToPlaylist = functions
  .runWith({
    timeoutSeconds: 500,
  })
  .https.onRequest(extractGenresFromTrackToPlaylist);
