import { Component, OnInit } from '@angular/core';
import { AuthService, Tokens, User } from '../+state';
import { Router } from '@angular/router';
import { AngularFireAuth } from '@angular/fire/auth';
import { first, tap } from 'rxjs/operators';
import { Observable, of } from 'rxjs';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css'],
})
export class LoginComponent implements OnInit {
  public user$: Observable<User>;
  public loggingIn$: Observable<boolean> = of(false);
  constructor(
    private afAuth: AngularFireAuth,
    private router: Router,
    private authService: AuthService
  ) {}

  async ngOnInit() {
    // Signup / refresh Spotify token process.
    this.afAuth.user
      .pipe(
        tap(async (user) => {
          // If a user exists, refreshes Spotify access token.
          if (user) {
            console.log('user is here');
            await this.getSpotifyToken();
            this.router.navigate(['home']);
            return;
          }
          const url = this.router.url;
          // If there is an access code within URL, creates a user.
          if (url.includes('code')) {
            this.loggingIn$ = of(true);
            const tokens = await this.getSpotifyToken(this.getUrlCode(url));
            if (tokens.custom_auth_token) {
              const user = await this.afAuth.signInWithCustomToken(
                tokens.custom_auth_token
              );
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
