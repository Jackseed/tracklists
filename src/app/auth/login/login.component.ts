import { Component, OnInit } from '@angular/core';
import { AuthService, Tokens, User } from '../+state';
import { Router } from '@angular/router';
import { first, tap } from 'rxjs/operators';
import { Observable, of } from 'rxjs';
import { Auth, signInWithCustomToken, user } from '@angular/fire/auth';

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
    private authService: AuthService
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
