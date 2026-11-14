// Angular
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DomSanitizer } from '@angular/platform-browser';
// Rxjs
import { combineLatest, firstValueFrom, Observable, of, timer } from 'rxjs';
import { distinctUntilChanged, filter, map, pairwise, take, tap } from 'rxjs/operators';
// States
import { AuthQuery, AuthService, User } from '../auth/+state';
import { SessionService } from '../auth/session.service';
import { LibraryImportService } from '../library/library-import.service';
import { playbackErrorMessage, SpotifyService } from '../spotify/spotify.service';
import { Track, TrackQuery, TrackService } from '../tracks/+state';
import { Playlist, PlaylistQuery } from '../playlists/+state';
import { PlayerQuery, PlayerTrack } from '../player/+state';
import { HomeView, toHomeView } from './home-view';
import { NativeAppService } from '../core/native-app.service';
// Components
import { PlaylistFormComponent } from '../playlists/playlist-form/playlist-form.component';
// Flex layout
import { MediaObserver } from '@ngbracket/ngx-layout';
// Material
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatIconRegistry } from '@angular/material/icon';

const ICONS: Record<string, string> = {
  'curvy-arrow': 'assets/curvy_arrow.svg',
  'straight-arrow': 'assets/straight-arrow.svg',
  'tracklists-empty': 'assets/navbar/tracklists-empty.svg',
  'tracklists-fill': 'assets/navbar/tracklists-fill.svg',
  'playlists-empty': 'assets/navbar/playlists-empty.svg',
  'playlists-fill': 'assets/navbar/playlists-fill.svg',
  'filters-empty': 'assets/navbar/filters-empty.svg',
  'filters-fill': 'assets/navbar/filters-fill.svg',
};

@Component({
  selector: 'app-homepage',
  templateUrl: './homepage.component.html',
  styleUrls: ['./homepage.component.css'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class HomepageComponent implements OnInit {
  private authQuery = inject(AuthQuery);
  private authService = inject(AuthService);
  private session = inject(SessionService);
  private importService = inject(LibraryImportService);
  private trackQuery = inject(TrackQuery);
  private trackService = inject(TrackService);
  private playlistQuery = inject(PlaylistQuery);
  private playerQuery = inject(PlayerQuery);
  private spotifyService = inject(SpotifyService);
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);
  private destroyRef = inject(DestroyRef);
  private nativeApp = inject(NativeAppService);
  public media = inject(MediaObserver);

  public user$: Observable<User>;
  public view$: Observable<HomeView>;
  public trackNumber$: Observable<number>;
  /** "4,922 tracks · 301 playlists", plus the playlists Spotify would not let us read. */
  public librarySummary$: Observable<{ text: string; skipped: number; warnings: string }>;
  public playingTrack$: Observable<PlayerTrack>;
  public userTopTrack$: Observable<Track | false> = of(false);
  private topTracksRequested = false;
  /** Selected tab of the phone layout (0: tracks). */
  public mobileTab = 0;

  constructor() {
    const registry = inject(MatIconRegistry);
    const sanitizer = inject(DomSanitizer);
    for (const [name, url] of Object.entries(ICONS)) registry.addSvgIcon(name, sanitizer.bypassSecurityTrustResourceUrl(url));
  }

  ngOnInit() {
    this.spotifyService.initializePlayer();
    // Android back button: from the Playlists or Filters tab, back to the tracks first.
    const stopBack = this.nativeApp.onBack(() => {
      if (this.mobileTab === 0) return false;
      this.mobileTab = 0;
      return true;
    });
    this.destroyRef.onDestroy(stopBack);

    this.view$ = combineLatest([
      this.importService.view$,
      this.session.playlistsSynced$,
      this.trackQuery.selectLibraryLoading(),
      this.trackQuery.selectCount(),
      this.playlistQuery.selectCount(),
    ]).pipe(
      map(([importView, playlistsSynced, library, trackCount, playlistCount]) => toHomeView({ importView, playlistsSynced, library, trackCount, playlistCount })),
      distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
      // While Spotify is read, show some of the user's favourite tracks.
      tap((view) => view.kind === 'importing' && this.loadTopTracks())
    );

    // (Re)loads the tracks at startup and each time an import completes, here or in another tab.
    this.authQuery
      .selectActive((user) => user?.libraryUpdatedAt?.toMillis() ?? null)
      .pipe(distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.trackService.loadLibrary());

    // A reload that fails (error recorded by the server, request that could not be sent,
    // import that stopped giving signs of life) keeps the library on screen: just say so.
    this.importService.view$
      .pipe(
        pairwise(),
        filter(([before, after]) => before.kind === 'running' && after.kind === 'error'),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(([, view]) => {
        if (view.kind === 'error' && this.trackQuery.getCount() > 0) this.openSnackBar(view.message, 6000);
      });
    this.importService.warnings$
      .pipe(
        // Not the warnings of an import finished before this visit.
        pairwise(),
        map(([, current]) => current),
        filter((current) => !!current),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((current) => this.openSnackBar(current.warnings[0], 8000));

    this.trackNumber$ = this.trackService.tracksLength$;
    this.librarySummary$ = combineLatest([this.trackQuery.selectCount(), this.playlistQuery.selectCount(), this.importService.state$]).pipe(
      map(([tracks, playlists, state]) => {
        const done = state?.status === 'done' ? state : undefined;
        return {
          text: `${tracks.toLocaleString('en')} tracks · ${playlists.toLocaleString('en')} playlists`,
          skipped: done?.stats?.skippedPlaylists ?? 0,
          warnings: (done?.warnings ?? []).join('\n'),
        };
      })
    );
    this.playingTrack$ = this.playerQuery.selectActive() as Observable<PlayerTrack>;
  }

  /** Imports (or re-imports) the library from Spotify. */
  public loadPlaylist() {
    this.importService.start();
  }

  public retry(view: HomeView) {
    if (view.kind !== 'error') return;
    if (view.needsLogin) return this.authService.authSpotify();
    if (view.retry === 'load') return this.trackService.loadLibrary();
    this.importService.dismissError();
    this.importService.start();
  }

  private async loadTopTracks() {
    if (this.topTracksRequested) return;
    this.topTracksRequested = true;
    try {
      const topTracks = await this.spotifyService.getActiveUserTopTracks();
      if (topTracks.length === 0) return;
      // Changes top track to display every 3.5s
      // Shows another one every 3.5 s; the template cross-fades them.
      this.userTopTrack$ = timer(0, 3500).pipe(map((n) => topTracks[n % topTracks.length]));
    } catch (error) {
      // Decoration only: the import does not depend on it.
      console.warn('[Homepage] could not load the top tracks:', error);
      this.topTracksRequested = false;
    }
  }

  public playAll() {
    this.trackService
      .selectFilteredTracks()
      .pipe(take(1))
      .subscribe((tracks) => this.spotifyService.play(tracks.map((track) => track.uri)).catch((error) => this.playbackError(error)));
  }

  public async savePlaylist() {
    const dialogRef = this.dialog.open(PlaylistFormComponent, { width: '400px' });
    const name: string | undefined = await firstValueFrom(dialogRef.afterClosed());
    if (!name) return;
    try {
      const tracks = await firstValueFrom(this.trackService.selectFilteredTracks());
      const playlist: Playlist = await this.spotifyService.createPlaylist(name);
      await this.spotifyService.addTracksToPlaylistByBatches(playlist.id, tracks);
      this.openSnackBar('Playlist saved!');
    } catch (error) {
      console.error('[Homepage] could not save the playlist:', error);
      this.openSnackBar('The playlist could not be saved to Spotify.', 5000);
    }
  }

  private playbackError(error: unknown) {
    console.error('[Homepage] playback failed:', error);
    this.openSnackBar(playbackErrorMessage(error, 'Spotify could not start the playback.'), 5000);
  }

  private openSnackBar(message: string, duration = 2000) {
    this.snackBar.open(message, '', { duration });
  }

  public signOut() {
    this.authService.signOut();
  }
}
