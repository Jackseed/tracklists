import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { Meta } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../+state';
import { callableErrorMessage } from '../../core/firebase';

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

  public loggingIn = false;
  public error: string | null = null;

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
    const params = this.route.snapshot.queryParamMap;
    const code = params.get('code');
    if (params.get('error')) {
      this.error = 'Spotify did not grant access. Tracklists needs it to load your songs.';
    } else if (code) {
      await this.finishLogin(code);
    }
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
      // Drop the used code from the address bar: it only works once.
      this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
    } finally {
      this.loggingIn = false;
    }
  }

  public loginToSpotify() {
    this.authService.authSpotify();
  }
}
