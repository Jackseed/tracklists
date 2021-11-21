import { Component, OnInit } from '@angular/core';
import { AuthService, Tokens, User } from '../+state';
import { Router } from '@angular/router';
import { AngularFireAuth } from '@angular/fire/auth';
import { first, tap } from 'rxjs/operators';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css'],
})
export class LoginComponent implements OnInit {
  public user$: Observable<User>;
  constructor(
    private afAuth: AngularFireAuth,
    private router: Router,
    private authService: AuthService
  ) {}

  async ngOnInit() {
    // Signup / refresh Spotify token process.
    this.afAuth.user
      .pipe(
        // Waits for redirection to be ended before checking url for a Spotify access code.
        // filter(([user, event]) => event instanceof NavigationEnd),
        tap(async (user) => {
          console.log('starting login');
          // If a user exists, refreshes Spotify access token.
          if (user) {
            console.log('user is here');
            await this.getSpotifyToken();
            return;
          }
          const url = this.router.url;
          // If there is an access code within URL, creates a user.
          if (url.includes('code')) {
            console.log('spotting a code');
            const tokens = await this.getSpotifyToken(this.getUrlCode(url));
            console.log(tokens);
            if (tokens.custom_auth_token) {
              const user = await this.afAuth.signInWithCustomToken(
                tokens.custom_auth_token
              );
              // Resets the process if there is a code but user isn't connected.
            } else {
              return;
            }
            // If user isn't connected and there is no code within url, opens dialog to create one.
          } else {
            this.loginToSpotify();
          }
        }),
        first()
      )
      .subscribe();

    this.user$ = this.afAuth.user;
    this.user$.subscribe((_) => console.log('user: ', _));

    this.afAuth.authState.subscribe(console.log);
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
