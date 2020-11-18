import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AuthStore } from './auth.store';
import { environment } from 'src/environments/environment';

@Injectable({ providedIn: 'root' })
export class AuthService {

  authorizeURL = 'https://accounts.spotify.com/authorize';
  clientId: string = environment.spotify.clientId;
  // baseUrl: string = environment.spotify.apiURL;
  responseType: string = 'token';
  redirectURI = environment.spotify.redirectURI;

  scope = [
  'user-read-email',
  'user-read-currently-playing',
  'user-modify-playback-state',
  'streaming',
  'user-read-playback-state',
  'user-read-private',
  'user-top-read',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-library-read'
  ].join('%20');

  constructor(private authStore: AuthStore,
              private http: HttpClient) {
  }

  authSpotify() {
    window.location.href = this.getAuthUrl();
    return false;
  }

  getAuthUrl(): string {
    this.authorizeURL += '?' + 'client_id=' + this.clientId;
    this.authorizeURL += '&response_type=' + this.responseType;
    this.authorizeURL += '&redirect_uri=' + this.redirectURI;
    this.authorizeURL += '&scope=' + this.scope;
    return this.authorizeURL;
  }

}
