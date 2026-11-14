// Angular
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
// Rxjs
import { firstValueFrom } from 'rxjs';
// States
import { environment } from '../../environments/environment';
import { AuthQuery, AuthService, Devices } from '../auth/+state';
import { Playlist } from '../playlists/+state';
import { PlayerQuery } from '../player/+state';
import { PlayerService } from '../player/+state/player.service';
import { Track, TrackQuery } from '../tracks/+state';

declare global {
  interface Window {
    onSpotifyWebPlaybackSDKReady(): void;
    Spotify: typeof Spotify;
  }
}

/** Not documented by Spotify, but a play request with much more than this fails. */
const MAX_URIS_PER_PLAY = 700;
const MAX_URIS_PER_PLAYLIST_REQUEST = 100;
const SDK_URL = 'https://sdk.scdn.co/spotify-player.js';

@Injectable({
  providedIn: 'root',
})
export class SpotifyService {
  private authQuery = inject(AuthQuery);
  private authService = inject(AuthService);
  private playerQuery = inject(PlayerQuery);
  private playerService = inject(PlayerService);
  private trackQuery = inject(TrackQuery);
  private http = inject(HttpClient);
  private title = inject(Title);

  private readonly api = environment.spotify.apiUrl;
  private sdk?: Promise<typeof Spotify>;

  //--------------------------------
  //         WEB PLAYBACK         //
  //--------------------------------
  public async initializePlayer(trackUris?: string[]) {
    let Player: typeof Spotify.Player;
    try {
      ({ Player } = await this.loadSdk());
    } catch (error) {
      // No in-browser player (blocked script, offline): the rest of the app still works.
      console.warn('[Spotify]', error);
      return;
    }

    // Instantiates Spotify player.
    const player = new Player({
      name: 'Tracklists',
      getOAuthToken: (callback) => {
        this.authService
          .getAccessToken()
          .then(callback)
          .catch((error) => console.warn('[Spotify] no access token for the player:', error));
      },
    });

    player.connect();

    // Sets device id
    player.addListener('ready', ({ device_id }) => {
      this.authService.saveDeviceId(device_id);

      if (trackUris) this.play(trackUris, device_id);
    });

    // When player state changes, sets active the track.
    player.addListener('player_state_changed', (state) => {
      const current = state?.track_window?.current_track;
      if (!current) return;

      // Track relinking: Spotify may play another version of the track than the one in the library.
      const linkedFromId = (current as { linked_from?: { id?: string | null } }).linked_from?.id;
      const dbTrack = this.trackQuery.getEntity(current.id) ?? (linkedFromId ? this.trackQuery.getEntity(linkedFromId) : undefined);
      if (!dbTrack) return;

      const track = {
        ...dbTrack,
        position: state.position,
        paused: state.paused,
      };

      const pause = this.playerQuery.getPaused(track.id);

      this.playerService.add(track);
      this.playerService.setActive(track.id);
      this.playerService.updatePosition(track.id, state.position);
      this.playerService.updateShuffle(state.shuffle);
      // update playing track with state paused
      if (state.paused !== pause) this.playerService.updatePaused(track.id, state.paused);

      this.title.setTitle(state.paused ? 'Tracklists' : `${track.name} - ${track.artists?.[0]?.name ?? ''}`);
    });
  }

  /**
   * Loads Spotify's Web Playback SDK on first use (only the app itself needs
   * it, not the landing and login pages).
   *
   * The SDK calls `window.onSpotifyWebPlaybackSDKReady` once loaded and throws
   * if it is missing. The callback is set here rather than in index.html: a
   * window property named `on...` that exists before zone.js loads is taken for
   * an event handler by zone.js and reads back as `null`.
   */
  private loadSdk(): Promise<typeof Spotify> {
    this.sdk ??= new Promise<typeof Spotify>((resolve, reject) => {
      if (window.Spotify) return resolve(window.Spotify);
      window.onSpotifyWebPlaybackSDKReady = () => resolve(window.Spotify);
      const script = document.createElement('script');
      script.src = SDK_URL;
      script.async = true;
      script.onerror = () => {
        this.sdk = undefined;
        reject(new Error('The Spotify player could not be loaded'));
      };
      document.body.appendChild(script);
    });
    return this.sdk;
  }

  //--------------------------------
  //             PLAYER           //
  //--------------------------------
  public addToPlayback(trackUri: string) {
    return this.post(`/me/player/queue?uri=${encodeURIComponent(trackUri)}`, null, true);
  }

  public previous() {
    return this.post('/me/player/previous', null, true);
  }

  public next() {
    return this.post('/me/player/next', null, true);
  }

  public async play(trackUris?: string[], newDeviceId?: string): Promise<void> {
    let deviceId = newDeviceId;

    // Verifies user device if no new device id is attached.
    if (!deviceId) {
      deviceId = this.authQuery.getActive()?.deviceId;

      // Verifies that deviceId is still valid, otherwise updates it and relaunches play.
      if (!deviceId || !(await this.deviceExists(deviceId))) {
        await this.initializePlayer(trackUris);
        return;
      }
    }
    // Without uris, Spotify resumes the current playback.
    const body = trackUris ? { uris: trackUris.slice(0, MAX_URIS_PER_PLAY) } : null;
    await this.put(`/me/player/play?device_id=${encodeURIComponent(deviceId)}`, body, true);
  }

  private async deviceExists(deviceId: string): Promise<boolean> {
    const { devices } = await this.get<Devices>('/me/player/devices');
    return (devices ?? []).some((device) => device.id === deviceId);
  }

  public pause() {
    return this.put('/me/player/pause', null, true);
  }

  public shuffle(state: boolean) {
    return this.put(`/me/player/shuffle?state=${state}`, null, true);
  }

  public seekPosition(position_ms: number) {
    return this.put(`/me/player/seek?position_ms=${position_ms}`, null, true);
  }

  public addToLikedTracks(trackId: string) {
    return this.put(`/me/tracks?ids=${trackId}`, null, true);
  }

  public async removeFromLikedTracks(trackId: string) {
    const headers = await this.getHeaders();
    return firstValueFrom(this.http.delete(`${this.api}/me/tracks?ids=${trackId}`, { headers, responseType: 'text' }));
  }

  //--------------------------------
  //           PLAYLISTS          //
  //--------------------------------
  public createPlaylist(name: string): Promise<Playlist> {
    return this.post<Playlist>('/me/playlists', { name });
  }

  public async addTracksToPlaylistByBatches(playlistId: string, tracks: Track[]) {
    const uris = tracks.map((track) => track.uri).filter(Boolean);
    for (let i = 0; i < uris.length; i += MAX_URIS_PER_PLAYLIST_REQUEST) {
      await this.post(`/playlists/${playlistId}/items`, { uris: uris.slice(i, i + MAX_URIS_PER_PLAYLIST_REQUEST) });
    }
  }

  //--------------------------------
  //             USER             //
  //--------------------------------
  public async getActiveUserTopTracks(): Promise<Track[]> {
    const paging = await this.get<{ items: Track[] }>('/me/top/tracks?limit=50&time_range=long_term');
    return paging?.items ?? [];
  }

  //--------------------------------
  //          HTTP CALLS          //
  //--------------------------------
  private async getHeaders(): Promise<HttpHeaders> {
    const token = await this.authService.getAccessToken();
    return new HttpHeaders().set('Authorization', 'Bearer ' + token);
  }

  private async get<T>(path: string): Promise<T> {
    const headers = await this.getHeaders();
    return firstValueFrom(this.http.get<T>(this.api + path, { headers }));
  }

  // Player endpoints answer with an empty body: it must not be parsed as JSON.
  private async post<T = unknown>(path: string, body: unknown, emptyResponse = false): Promise<T> {
    const headers = await this.getHeaders();
    if (emptyResponse) return firstValueFrom(this.http.post(this.api + path, body, { headers, responseType: 'text' })) as Promise<T>;
    return firstValueFrom(this.http.post<T>(this.api + path, body, { headers }));
  }

  private async put<T = unknown>(path: string, body: unknown, emptyResponse = false): Promise<T> {
    const headers = await this.getHeaders();
    if (emptyResponse) return firstValueFrom(this.http.put(this.api + path, body, { headers, responseType: 'text' })) as Promise<T>;
    return firstValueFrom(this.http.put<T>(this.api + path, body, { headers }));
  }
}
