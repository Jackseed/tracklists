// Angular
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Title } from '@angular/platform-browser';
// Rxjs
import { firstValueFrom } from 'rxjs';
// States
import { environment } from '../../environments/environment';
import { AuthQuery, AuthService, Device, Devices } from '../auth/+state';
import { isNativeApp, nativePlatform } from '../core/native';
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

/** Spotify Connect, in the app: how often the playback is read, and how long after a command. */
const CONNECT_SYNC_MS = 5000;
const CONNECT_COMMAND_DELAY_MS = 800;
/** Once the Spotify app is opened, how many times (one per second) to look for it among the devices. */
const DEVICE_WAIT_TRIES = 15;
const DEVICE_WAIT_MAX_SECONDS = 600;
const SPOTIFY_APP_URL = 'spotify:';
const SPOTIFY_ANDROID_PACKAGE = 'com.spotify.music';

/** What a player reports: the Web Playback SDK or, in the app, Spotify Connect. */
interface PlayerSnapshot {
  trackId: string;
  linkedFromId?: string | null;
  /** In ms. */
  position: number;
  paused: boolean;
  shuffle: boolean;
}

/** GET /me/player (empty when nothing plays anywhere). */
interface CurrentPlayback {
  is_playing: boolean;
  progress_ms: number | null;
  shuffle_state: boolean;
  item: { id: string; linked_from?: { id?: string } } | null;
}

/** A playback failure whose message is worded for the user. */
export class PlaybackError extends Error {}

/** Message to show for a failed playback command. */
export function playbackErrorMessage(error: unknown, fallback: string): string {
  return error instanceof PlaybackError ? error.message : fallback;
}

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
  private snackBar = inject(MatSnackBar);

  private readonly api = environment.spotify.apiUrl;
  private sdk?: Promise<typeof Spotify>;

  //--------------------------------
  //         WEB PLAYBACK         //
  //--------------------------------
  public async initializePlayer(trackUris?: string[]) {
    // No in-browser player in the app: it drives the Spotify app instead (see SPOTIFY CONNECT below).
    if (isNativeApp) return this.startConnectSync();

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
      if (!current?.id) return;
      this.applyPlayerState({
        trackId: current.id,
        // Track relinking: Spotify may play another version of the track than the one in the library.
        linkedFromId: (current as { linked_from?: { id?: string | null } }).linked_from?.id,
        position: state.position,
        paused: state.paused,
        shuffle: state.shuffle,
      });
    });
  }

  /** Shows what Spotify plays, whether it comes from the in-browser player or from Spotify Connect. */
  private applyPlayerState({ trackId, linkedFromId, position, paused, shuffle }: PlayerSnapshot) {
    const dbTrack = this.trackQuery.getEntity(trackId) ?? (linkedFromId ? this.trackQuery.getEntity(linkedFromId) : undefined);
    if (!dbTrack) return;

    const track = { ...dbTrack, position, paused };
    const pause = this.playerQuery.getPaused(track.id);

    this.playerService.add(track);
    this.playerService.setActive(track.id);
    this.playerService.updatePosition(track.id, position);
    this.playerService.updateShuffle(shuffle);
    // update playing track with state paused
    if (paused !== pause) this.playerService.updatePaused(track.id, paused);

    this.title.setTitle(paused ? 'Tracklists' : `${track.name} - ${track.artists?.[0]?.name ?? ''}`);
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
  //        SPOTIFY CONNECT       //
  //--------------------------------
  // The Web Playback SDK does not run in the iOS / Android WebView (no DRM, and
  // Spotify does not support mobile browsers). The app plays on one of the
  // user's Spotify Connect devices instead (this phone's Spotify app, a
  // speaker, a computer...) and reads the playback back every few seconds.
  private connectSyncStarted = false;

  private startConnectSync() {
    if (this.connectSyncStarted) return;
    this.connectSyncStarted = true;
    const sync = () => {
      if (document.visibilityState === 'visible') this.syncConnectPlayback();
    };
    window.setInterval(sync, CONNECT_SYNC_MS);
    document.addEventListener('visibilitychange', sync);
    sync();
  }

  private async syncConnectPlayback() {
    try {
      const playback = await this.get<CurrentPlayback | null>('/me/player');
      const item = playback?.item;
      if (!playback || !item?.id) return;
      this.applyPlayerState({
        trackId: item.id,
        linkedFromId: item.linked_from?.id,
        position: playback.progress_ms ?? 0,
        paused: !playback.is_playing,
        shuffle: playback.shuffle_state,
      });
    } catch (error) {
      console.warn('[Spotify] could not read the playback:', error);
    }
  }

  private async playOnConnectDevice(trackUris?: string[]) {
    this.startConnectSync();
    const device = (await this.findConnectDevice()) ?? (await this.wakeSpotifyApp());
    // Without uris, Spotify resumes the current playback.
    const body = trackUris ? { uris: trackUris.slice(0, MAX_URIS_PER_PLAY) } : null;
    await this.put(`/me/player/play?device_id=${encodeURIComponent(device.id)}`, body, true);
  }

  /** The device playing now, else this phone, else any device that takes commands. */
  private async findConnectDevice(): Promise<Device | undefined> {
    const { devices = [] } = (await this.get<Devices>('/me/player/devices')) ?? {};
    const usable = devices.filter((device) => device.id && !device.is_restricted);
    return usable.find((device) => device.is_active) ?? usable.find((device) => device.type === 'Smartphone') ?? usable[0];
  }

  /** No device: opens the Spotify app, which then shows up as one. */
  private async wakeSpotifyApp(): Promise<Device> {
    const { AppLauncher } = await import('@capacitor/app-launcher');
    const installed = await AppLauncher.canOpenUrl({ url: nativePlatform === 'android' ? SPOTIFY_ANDROID_PACKAGE : SPOTIFY_APP_URL })
      .then(({ value }) => value)
      .catch(() => false);
    if (!installed) throw new PlaybackError('Install Spotify or open it on another device, then try again.');

    this.snackBar.open('Opening Spotify… Come back to Tracklists to start your tracklist.', '', { duration: 6000 });
    await AppLauncher.openUrl({ url: SPOTIFY_APP_URL });

    // Only count the tries made while Tracklists is on screen: the user is in Spotify meanwhile.
    for (let tries = 0, waits = 0; tries < DEVICE_WAIT_TRIES && waits < DEVICE_WAIT_MAX_SECONDS; waits++) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      if (document.visibilityState !== 'visible') continue;
      tries++;
      const device = await this.findConnectDevice().catch(() => undefined);
      if (device) return device;
    }
    throw new PlaybackError('Spotify did not answer. Play any song in Spotify, then come back and try again.');
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
    if (isNativeApp) return this.playOnConnectDevice(trackUris);
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
    const response = emptyResponse
      ? ((await firstValueFrom(this.http.post(this.api + path, body, { headers, responseType: 'text' }))) as T)
      : await firstValueFrom(this.http.post<T>(this.api + path, body, { headers }));
    this.afterPlayerCommand(path);
    return response;
  }

  private async put<T = unknown>(path: string, body: unknown, emptyResponse = false): Promise<T> {
    const headers = await this.getHeaders();
    const response = emptyResponse
      ? ((await firstValueFrom(this.http.put(this.api + path, body, { headers, responseType: 'text' }))) as T)
      : await firstValueFrom(this.http.put<T>(this.api + path, body, { headers }));
    this.afterPlayerCommand(path);
    return response;
  }

  /** With Spotify Connect nothing tells the app what changed: read the playback again once Spotify applied the command. */
  private afterPlayerCommand(path: string) {
    if (isNativeApp && path.startsWith('/me/player')) window.setTimeout(() => this.syncConnectPlayback(), CONNECT_COMMAND_DELAY_MS);
  }
}
