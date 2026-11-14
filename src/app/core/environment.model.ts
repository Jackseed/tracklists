import { FirebaseOptions } from 'firebase/app';

/** Shape of the files in `src/environments/` (they are not committed). */
export interface Environment {
  production: boolean;
  /** Talk to the local Firebase emulators (auth 9099, firestore 8080, functions 5001) instead of the cloud. */
  useEmulators: boolean;
  /** Region of the Cloud Functions. */
  functionsRegion: string;
  spotify: {
    /** Web API root, without trailing slash: https://api.spotify.com/v1 */
    apiUrl: string;
    /** Accounts service: https://accounts.spotify.com */
    accountsUrl: string;
    clientId: string;
    /**
     * Must be registered in the Spotify developer dashboard. Spotify refuses
     * `localhost`: use http://127.0.0.1:4200/login for local development.
     */
    redirectURI: string;
  };
  firebaseConfig: FirebaseOptions;
  sentry: {
    dsn: string;
  };
}
