import { Environment } from '../app/core/environment.model';

/**
 * Template for the environment files, which are not committed:
 *   environment.ts          local development (Firebase emulators + the real Spotify API)
 *   environment.staging.ts  hosted build against the development Firebase project
 *   environment.prod.ts     production
 * Copy this file and fill in the values from the Firebase console and the
 * Spotify developer dashboard. `environment.fake.ts` needs no account at all.
 */
export const environment: Environment = {
  production: false,
  useEmulators: true,
  functionsRegion: 'europe-west1',
  spotify: {
    apiUrl: 'https://api.spotify.com/v1',
    accountsUrl: 'https://accounts.spotify.com',
    clientId: '<spotify client id>',
    // Spotify refuses `localhost`: register this loopback address in the dashboard.
    redirectURI: 'http://127.0.0.1:4200/login',
  },
  firebaseConfig: {
    apiKey: '<firebase web api key>',
    authDomain: '<project-id>.firebaseapp.com',
    projectId: '<project-id>',
    storageBucket: '<project-id>.appspot.com',
    messagingSenderId: '<sender id>',
    appId: '<app id>',
  },
  sentry: {
    dsn: '',
  },
};
