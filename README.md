# Tracklists

Filter your Spotify library by genre, energy, danceability, BPM… and save the result as a playlist.
Live at [tracklists.io](https://tracklists.io).

- **Web app**: Angular 22 (NgModules, Angular Material, Akita stores), in `src/`
- **Backend**: Firebase — Auth (custom tokens), Firestore, Cloud Functions 2nd gen (Node 22), in `functions/`
- **Firebase projects**: `listy-bcc65` (development / staging, the default) and `listy-prod` (production, alias `prod`: an alias named like its project
  makes `firebase deploy --only functions` fail, as it reads `functions/.env.listy-prod` twice)

## Requirements

- Node 22 (`nvm use` reads `.nvmrc`)
- Java 21+ for the Firebase emulators (`npm run emulators:*` picks a recent JDK by itself when the default `java` is older)
- Chrome, only for `npm run e2e`

```bash
npm install
npm --prefix functions install
```

## Configuration

Nothing secret is committed.

| What | Where | Notes |
| --- | --- | --- |
| Web app | `src/environments/environment*.ts` | Copy `environment.example.ts`. `environment.ts` = local, `.staging.ts`, `.prod.ts` |
| Functions, per project | `functions/.env.<project id>` | Copy `functions/.env.example` |
| Spotify client secret (deployed) | Secret Manager | `firebase functions:secrets:set SPOTIFY_CLIENT_SECRET --project <id>` |
| Spotify client secret (emulators) | `functions/.secret.local` | `SPOTIFY_CLIENT_SECRET=...` |

Spotify refuses `localhost` as a redirect URI: local development uses `http://127.0.0.1:4200/login`,
which must be registered in the [Spotify dashboard](https://developer.spotify.com/dashboard) along with
the staging and production URLs.

## Running locally

### Without any account: fake Spotify

A fake Spotify server (`tools/fake-spotify`) serves a deterministic library of any size, with rate
limiting, errors and expiring tokens on demand. Everything else runs in the Firebase emulators.

```bash
npm run emulators:fake   # Firebase emulators (demo project) + fake Spotify on :8888
npm run start:fake       # the app on http://127.0.0.1:4200
```

Size and behaviour of the fake library are set with environment variables, for instance a large
library behind a rate limit:

```bash
FAKE_SPOTIFY_TRACKS=20000 FAKE_SPOTIFY_PLAYLISTS=300 FAKE_SPOTIFY_LIKED=5000 FAKE_SPOTIFY_RATE_LIMIT=600 npm run emulators:fake
```

`http://127.0.0.1:8888/__stats` shows what the fake server received; `POST /__config` changes its
behaviour while it runs (e.g. `{"errorRate": 1}` to simulate an outage).

### With the real Spotify API

```bash
npm run emulators:start  # Firebase emulators for the default project, real Spotify
npm start                # the app on http://127.0.0.1:4200
```

## Tests

```bash
npm test                  # web app unit tests (Vitest)
npm run test:functions    # functions unit tests, against the fake Spotify server
npm run test:integration  # the import end to end, in the Firestore and Auth emulators
npm run e2e               # the whole app in headless Chrome (needs the two "fake" commands above running)
npm run bench:import      # times the import of a large library (BENCH_TRACKS, BENCH_RATE_LIMIT...)
npm run lint
```

## How the library import works

`importLibrary` (callable function) reads the playlists, liked tracks, audio features and artist
genres from Spotify and writes them to Firestore:

- `tracks/{trackId}` — shared between users, linked through `userIds`
- `playlists/{playlistId}` with its `trackIds`, plus `playlists/{id}/genres/{genre}`
- `users/{uid}` — Spotify tokens, `playlistIds`, and the state of the import in `import`

The web app does not wait for the HTTP answer: it listens to `users/{uid}.import` (phase, progress,
heartbeat, outcome). The import therefore survives a closed tab, and the library itself never
travels through the function's response. When the import completes, `libraryUpdatedAt` changes and
the app reads the tracks from Firestore page by page, then caches them in the browser (IndexedDB);
on later visits the cache is used as long as `libraryUpdatedAt` has not changed.

Spotify calls go through `functions/src/spotify/client.ts`: bounded concurrency and pace, `Retry-After`
honoured for every pending request on a 429, retries on 5xx and network errors, token refreshed on the
server when it expires half-way. A page that cannot be fetched fails the import: nothing is ever
unlinked from a partial read.

## Deploying

```bash
npm run deploy:staging   # builds the staging configuration and deploys hosting to listy-bcc65
npm run deploy           # builds production and deploys hosting to listy-prod
firebase deploy --only functions --project <id>
firebase deploy --only firestore:rules,firestore:indexes --project <id>
```

### First deployment of this version (per project)

The functions moved to 2nd gen, to `europe-west1` and to new names (`spotifyLogin`,
`spotifyRefreshToken`, `importLibrary`); the runtime config (`functions.config()`) no longer exists.

1. Fill `functions/.env.<project id>` (see `.env.example`), in particular `CUSTOM_TOKEN_SERVICE_ACCOUNT`
   (the former `functions.serviceaccountid`).
2. `firebase functions:secrets:set SPOTIFY_CLIENT_SECRET --project <id>`
3. Register the redirect URI of the environment in the Spotify dashboard.
4. `firebase deploy --only functions,firestore:indexes --project <id>`, then deploy hosting.
5. Once the new web app is live: `firebase deploy --only firestore:rules --project <id>`
   (the previous web app does not work with the new rules).
6. Delete the former functions, which are public HTTP endpoints:
   `firebase functions:delete getSpotifyToken saveToken saveUserPlaylists firestoreWrite removesUnusedTracks extractGenresFromTrackToPlaylist deleteGenresCollection --region us-central1 --project <id>`

The functions run as `<project id>@appspot.gserviceaccount.com`, like the former ones, so that the
existing IAM grants (signing custom tokens) keep working; `FUNCTIONS_SERVICE_ACCOUNT` overrides it.

## Mobile app (iOS, Android)

`ios/` and `android/` are [Capacitor](https://capacitorjs.com) shells around the web build
(`capacitor.config.ts`, app id `io.tracklists.app`). Needs Xcode for iOS, the Android SDK and a
JDK 21 for Android.

```bash
npm run mobile:fake      # web build against the local stack + `cap sync` (then npm run emulators:fake and start:fake)
npm run mobile:staging   # same with the staging configuration
npm run mobile:prod
npm run mobile:ios       # opens Xcode; run on a simulator or device from there
npm run mobile:android   # opens Android Studio
npm run mobile:assets    # icons and splash screens, from resources/ (python3 resources/make-sources.py rebuilds those)
```

TestFlight: `npm run mobile:staging` (or `mobile:prod`), then `npm run mobile:ios:ipa` builds
`.build-ios/export/App.ipa`, signed for App Store Connect, and `npm run mobile:ios:testflight` uploads it (team set in the Xcode project, Xcode
signed in to that Apple account, new build number each run). Upload it with Apple's Transporter
app or Xcode's Organizer. The environment's web `/login` page must be deployed first.

With the local stack on the Android emulator, forward the ports first:
`for p in 8080 9099 5001 8888 4200; do adb reverse tcp:$p tcp:$p; done`.

How it differs from the web app (see `src/app/core/native*.ts`):

- **Spotify login.** The app opens Spotify's consent page in an in-app browser (SFSafariViewController,
  Chrome Custom Tab) with the web redirect URI and a `state` starting with `app-`. The web `/login`
  page sees that prefix and forwards the code to `tracklists://login`, which the app handles. So the
  Spotify dashboard needs no new redirect URI, but the web app must be deployed with this `/login`
  page on the environment the app uses.
- **Playback.** The Web Playback SDK does not run in mobile WebViews. The app plays on a Spotify
  Connect device instead (the phone's Spotify app, opened through `spotify:` when no device is
  active, or any speaker or computer), and reads the playback every 5 s. Spotify Premium is still
  required.
- **Firebase.** Auth uses `initializeAuth` with IndexedDB persistence (`getAuth` can hang in a
  WebView). No service worker. The origins are `capacitor://localhost` (iOS) and
  `https://localhost` (Android): if the Firebase API key is restricted by HTTP referrer in the Google
  Cloud console, allow them.

## Spotify API notes

- The app relies on the audio-features and "several artists" endpoints, which Spotify only serves
  to apps in *extended quota mode* (the current app has it). Without them the import still
  completes, with a warning and without the corresponding filters.
- The recommendations endpoint was shut down by Spotify; the feature was removed.
- The web player uses the Web Playback SDK, which needs Spotify Premium and a desktop browser.
