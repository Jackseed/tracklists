import functions = require('firebase-functions');
import { getSpotifyToken, saveToken } from './spotify-auth';
const admin = require('firebase-admin');
admin.initializeApp();

exports.getSpotifyToken = functions
  .runWith({ timeoutSeconds: 500 })
  .https.onCall(getSpotifyToken);

exports.saveToken = functions
  .runWith({ timeoutSeconds: 60 })
  .https.onRequest(saveToken);
