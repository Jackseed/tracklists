import { ParamMap } from '@angular/router';
import { Capacitor } from '@capacitor/core';

/** True inside the iOS / Android app (Capacitor), false in a browser. */
export const isNativeApp = Capacitor.isNativePlatform();
/** 'ios', 'android' or 'web'. */
export const nativePlatform = Capacitor.getPlatform();

/**
 * Spotify login from the app:
 *  1. the app opens Spotify's consent page in an in-app browser, with the web
 *     app's usual redirect URI (already registered in the Spotify dashboard)
 *     and a `state` starting with APP_LOGIN_STATE_PREFIX;
 *  2. Spotify sends that browser back to the web app's /login page, which sees
 *     the prefix and forwards the code to APP_LOGIN_URL;
 *  3. the OS hands that URL to the app, which closes the browser and exchanges
 *     the code (with the same redirect URI) like the web app does.
 */
export const APP_LOGIN_URL = 'tracklists://login';
export const APP_LOGIN_STATE_PREFIX = 'app-';

/** The /login page was reached at the end of a login started from the app. */
export function isAppLoginReturn(params: ParamMap): boolean {
  return !!params.get('state')?.startsWith(APP_LOGIN_STATE_PREFIX);
}

/** The app URL that hands Spotify's answer (code or error, and state) back to the app. */
export function appLoginUrl(params: ParamMap): string {
  const query = new URLSearchParams();
  for (const key of ['code', 'error', 'state']) {
    const value = params.get(key);
    if (value) query.set(key, value);
  }
  return `${APP_LOGIN_URL}?${query}`;
}
