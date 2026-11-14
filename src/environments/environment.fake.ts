import { Environment } from '../app/core/environment.model';

/**
 * Fully local setup, no real account needed:
 *  - Firebase emulators with a demo project (`npm run emulators:fake`)
 *  - fake Spotify server (`npm run fake-spotify`)
 * Start the app with `npm run start:fake`.
 */
export const environment: Environment = {
  production: false,
  useEmulators: true,
  functionsRegion: 'europe-west1',
  spotify: {
    apiUrl: 'http://127.0.0.1:8888/v1',
    accountsUrl: 'http://127.0.0.1:8888',
    clientId: 'fake-client-id',
    redirectURI: 'http://127.0.0.1:4200/login',
  },
  firebaseConfig: {
    apiKey: 'fake-api-key',
    authDomain: 'demo-tracklists.firebaseapp.com',
    projectId: 'demo-tracklists',
    appId: '1:000000000000:web:0000000000000000000000',
  },
  sentry: {
    dsn: '',
  },
};
