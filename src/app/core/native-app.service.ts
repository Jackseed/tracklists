import { Injectable, NgZone, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { NavigationEnd, Router } from '@angular/router';
import type { URLOpenListenerEvent } from '@capacitor/app';
import { filter, take } from 'rxjs/operators';
import { APP_LOGIN_URL, isNativeApp } from './native';

/** Returns true when it handled the back button (closed a panel, went to the first tab...). */
export type BackHandler = () => boolean;

/**
 * Glue between the web app and the iOS / Android shell: links opened in the
 * app (end of the Spotify login), the Android back button, status bar and
 * splash screen. Does nothing in a browser.
 */
@Injectable({ providedIn: 'root' })
export class NativeAppService {
  private router = inject(Router);
  private zone = inject(NgZone);
  private dialog = inject(MatDialog);

  private backHandlers: BackHandler[] = [];

  public init() {
    if (!isNativeApp) return;

    // The splash stays until the first page is on screen. Watched right away: the first
    // navigation may end before the plugins below are loaded.
    const firstPage = new Promise<void>((resolve) =>
      this.router.events
        .pipe(
          filter((event) => event instanceof NavigationEnd),
          take(1)
        )
        .subscribe(() => resolve())
    );

    // Loaded on demand: the web app does not need the native plugins.
    Promise.all([import('@capacitor/app'), import('@capacitor/splash-screen'), import('@capacitor/status-bar')]).then(
      ([{ App }, { SplashScreen }, { StatusBar, Style }]) => {
        // White status bar text over the black app; the page draws under it (see the safe areas in styles.css).
        StatusBar.setStyle({ style: Style.Dark }).catch(() => undefined);
        firstPage.then(() => setTimeout(() => SplashScreen.hide({ fadeOutDuration: 200 }), 50));
        App.addListener('appUrlOpen', (event) => this.zone.run(() => this.onUrlOpen(event)));
        App.addListener('backButton', () => this.zone.run(() => this.onBackButton(App.minimizeApp)));
      }
    );
  }

  /** Lets a page handle the back button first (the latest registered wins). Returns the unregister function. */
  public onBack(handler: BackHandler): () => void {
    this.backHandlers.push(handler);
    return () => (this.backHandlers = this.backHandlers.filter((h) => h !== handler));
  }

  private onUrlOpen({ url }: URLOpenListenerEvent) {
    if (!url.startsWith(APP_LOGIN_URL)) return;
    // Spotify's answer to the login started by AuthService.authSpotify: the login page finishes it.
    import('@capacitor/browser').then(({ Browser }) => Browser.close()).catch(() => undefined);
    // Logins start from the login page. Elsewhere (already signed in, stale link) leaving the
    // page would stop the session for nothing: the login guard sends signed-in users back.
    if (!this.router.url.startsWith('/login')) return;
    const params = new URL(url).searchParams;
    const queryParams = Object.fromEntries(['code', 'error', 'state'].filter((key) => params.has(key)).map((key) => [key, params.get(key)]));
    this.router.navigate(['login'], { queryParams });
  }

  private onBackButton(minimizeApp: () => Promise<void>) {
    if (this.dialog.openDialogs.length) return this.dialog.openDialogs.at(-1)?.close();
    for (const handler of [...this.backHandlers].reverse()) if (handler()) return;
    // The home page is the root of the app, and nothing useful is behind the landing page.
    const url = this.router.url.split('?')[0];
    if (url === '/home' || url === '/' || history.length <= 1) return minimizeApp();
    history.back();
  }
}
