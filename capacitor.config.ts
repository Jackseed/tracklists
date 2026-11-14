import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Native shells (iOS, Android) around the web build in `dist/listy/browser`.
 * Build the web app with the wanted configuration, then `npx cap sync`
 * (see the `mobile:*` scripts of package.json).
 *
 * `CAP_DEV=1` is for the local stack only (`npm run mobile:fake`): it lets the
 * Android WebView (origin https://localhost) reach the Firebase emulators and
 * the fake Spotify server over plain http.
 */
const dev = process.env['CAP_DEV'] === '1';

const config: CapacitorConfig = {
  appId: 'io.tracklists.app',
  appName: 'Tracklists',
  webDir: 'dist/listy/browser',
  backgroundColor: '#000000',
  ios: {
    // The web app pads itself with env(safe-area-inset-*).
    contentInset: 'never',
  },
  android: {
    allowMixedContent: dev,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
      launchAutoHide: false,
      backgroundColor: '#000000',
      showSpinner: false,
    },
    // Edge to edge: the page pads itself with env(safe-area-inset-*) (index.html asks for viewport-fit=cover).
    SystemBars: {
      insetsHandling: 'native',
      initialViewportFitValueHint: 'cover',
      style: 'DARK',
    },
    StatusBar: {
      style: 'DARK',
    },
  },
};

export default config;
