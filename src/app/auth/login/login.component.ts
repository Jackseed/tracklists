import { Component, OnInit } from '@angular/core';
import { AuthService, Tokens, User } from '../+state';
import { Router } from '@angular/router';
import { first, tap } from 'rxjs/operators';
import { Observable, of } from 'rxjs';
import { Auth, signInWithCustomToken, user } from '@angular/fire/auth';
import { Meta } from '@angular/platform-browser';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css'],
})
export class LoginComponent implements OnInit {
  public user$: Observable<User>;
  public loggingIn$: Observable<boolean> = of(false);
  constructor(
    private auth: Auth,
    private router: Router,
    private authService: AuthService,
    private meta: Meta
  ) {}

  async ngOnInit() {
    // Signup / refresh Spotify token process.
    user(this.auth)
      .pipe(
        tap(async (user) => {
          // If a user exists, refreshes Spotify access token.
          if (user) {
            console.log('user is here');
            await this.getSpotifyToken().catch((err) => console.log(err));
            this.router.navigate(['home']);
            return;
          }
          const url = this.router.url;
          // If there is an access code within URL, creates a user.
          if (url.includes('code')) {
            this.loggingIn$ = of(true);
            const tokens = await this.getSpotifyToken(this.getUrlCode(url));
            if (tokens.custom_auth_token) {
              await signInWithCustomToken(
                this.auth,
                tokens.custom_auth_token
              ).catch((err) => console.log(err));
              this.router.navigate(['home']);
            }
          }
        }),
        first()
      )
      .subscribe();

    this.meta.addTags([
      { name: 'title', content: 'Login - Tracklists' },
      {
        name: 'description',
        content:
          'Login to Spotify to allow Tracklists to load your music library.',
      },
      {
        name: 'keywords',
        content:
          'Music, Spotify, Filters, Playlist, Free, Open source, Library',
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
        content:
          'Login to Spotify to allow Tracklists to load your music library.',
      },
      {
        name: 'og:image',
        content:
          'https://firebasestorage.googleapis.com/v0/b/listy-prod.appspot.com/o/tracklists-logo.png?alt=media&token=03541895-fe6a-4617-88e0-c62fd10b16a2',
      },
    ]);
  }

  // Gets a Spotify refresh or access token.
  private async getSpotifyToken(code?: string): Promise<Tokens> {
    return code ? this.authService.getToken(code) : this.authService.getToken();
  }

  // Gets Spotify access code within url.
  private getUrlCode(url: string): string {
    return url.substring(url.indexOf('=') + 1);
  }

  public loginToSpotify() {
    this.authService.authSpotify();
  }
}
