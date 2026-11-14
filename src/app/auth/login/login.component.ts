import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DomSanitizer, Meta, SafeUrl } from '@angular/platform-browser';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { AuthService } from '../+state';
import { callableErrorMessage } from '../../core/firebase';
import { appLoginUrl, isAppLoginReturn, isNativeApp } from '../../core/native';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class LoginComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private authService = inject(AuthService);
  private meta = inject(Meta);
  private destroyRef = inject(DestroyRef);
  private sanitizer = inject(DomSanitizer);

  public loggingIn = false;
  public error: string | null = null;
  /** Set on the web page that forwards a login started from the app back to it. */
  public appReturnUrl: string | null = null;
  /** Angular would prefix the tracklists:// link with "unsafe:" without this. */
  public appReturnHref: SafeUrl | null = null;

  async ngOnInit() {
    this.meta.addTags([
      { name: 'title', content: 'Login - Tracklists' },
      {
        name: 'description',
        content: 'Login to Spotify to allow Tracklists to load your music library.',
      },
      {
        name: 'keywords',
        content: 'Music, Spotify, Filters, Playlist, Free, Open source, Library',
      },
      { name: 'robots', content: 'index, follow' },
      { name: 'author', content: 'JackSeed' },
      {
        name: 'og:url',
        content: `https://tracklists.io/login`,
      },
      { name: 'og:title', content: 'Login - Tracklists' },
      {
        name: 'og:description',
        content: 'Login to Spotify to allow Tracklists to load your music library.',
      },
      {
        name: 'og:image',
        content:
          'https://firebasestorage.googleapis.com/v0/b/listy-prod.appspot.com/o/tracklists-logo.png?alt=media&token=03541895-fe6a-4617-88e0-c62fd10b16a2',
      },
    ]);

    // Spotify sends the browser back here with ?code=... (or ?error=... if the user refused).
    // In the app, NativeAppService navigates here with what Spotify sent to tracklists://login.
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => this.onSpotifyAnswer(params));
  }

  private async onSpotifyAnswer(params: ParamMap) {
    const code = params.get('code');
    const error = params.get('error');
    if (!code && !error) return;

    // A login started from the app ended in a browser: hand Spotify's answer over to the app.
    if (!isNativeApp && isAppLoginReturn(params)) {
      this.appReturnUrl = appLoginUrl(params);
      this.appReturnHref = this.sanitizer.bypassSecurityTrustUrl(this.appReturnUrl);
      window.location.replace(this.appReturnUrl);
      return;
    }
    if (isNativeApp && !this.authService.isPendingAppLogin(params.get('state'))) {
      this.error = 'This login link has expired. Please try again.';
      return this.clearQuery();
    }
    if (error) {
      this.error = 'Spotify did not grant access. Tracklists needs it to load your songs.';
      return this.clearQuery();
    }
    if (code) await this.finishLogin(code);
  }

  /** Drops Spotify's answer from the address bar: a code only works once. */
  private clearQuery() {
    this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
  }

  private async finishLogin(code: string) {
    this.loggingIn = true;
    try {
      await this.authService.loginWithCode(code);
      await this.router.navigate(['home']);
    } catch (error) {
      console.error('[Login] Spotify login failed:', error);
      // The server words `invalid-argument` errors for the user (expired link...).
      const worded = (error as { code?: string })?.code === 'functions/invalid-argument';
      this.error = (worded && callableErrorMessage(error)) || 'Login failed. Please try again.';
      this.clearQuery();
    } finally {
      this.loggingIn = false;
    }
  }

  public loginToSpotify() {
    this.error = null;
    this.authService.authSpotify().catch((error) => {
      console.error('[Login] could not open Spotify:', error);
      this.error = 'Spotify could not be opened. Please try again.';
    });
  }
}
