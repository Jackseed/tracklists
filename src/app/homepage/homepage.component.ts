import { Component, OnDestroy, OnInit } from '@angular/core';
import { NavigationEnd, Router, Scroll } from '@angular/router';
import { combineLatest, Observable, Subscription, timer } from 'rxjs';
import {
  AuthQuery,
  AuthService,
  AuthStore,
  Tokens,
  User,
} from '../auth/+state';
import { SpotifyService } from '../spotify/spotify.service';
import { Track, TrackQuery, TrackService } from '../tracks/+state';
import { filter, first, map, take, tap } from 'rxjs/operators';
import { Playlist } from 'src/app/playlists/+state';
import { PlaylistFormComponent } from 'src/app/playlists/playlist-form/playlist-form.component';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatIconRegistry } from '@angular/material/icon';
import { DomSanitizer } from '@angular/platform-browser';
import { PlayerQuery, PlayerTrack } from '../player/+state';
import { GenreQuery } from '../filters/genre-filters/+state';
import { AngularFireFunctions } from '@angular/fire/functions';
import { fadeInAnimation, fadeInOnEnterAnimation } from 'angular-animations';
import { AngularFireAuth } from '@angular/fire/auth';

@Component({
  selector: 'app-homepage',
  templateUrl: './homepage.component.html',
  styleUrls: ['./homepage.component.css'],
  animations: [fadeInOnEnterAnimation(), fadeInAnimation({ duration: 1500 })],
})
export class HomepageComponent implements OnInit, OnDestroy {
  public user$: Observable<User>;
  public trackNumber$: Observable<number>;
  public isTrackstoreLoading$: Observable<boolean>;
  public playingTrack$: Observable<PlayerTrack>;
  public isSpinning$: Observable<boolean>;
  public isTrackStoreEmpty$: Observable<boolean>;
  public userTopTracks: Track[];
  public userTopTrack$: Observable<Track>;
  public fadeInState: boolean = false;
  private animationSub: Subscription;

  constructor(
    private authStore: AuthStore,
    private authQuery: AuthQuery,
    private authService: AuthService,
    private afAuth: AngularFireAuth,
    private trackQuery: TrackQuery,
    private trackService: TrackService,
    private playerQuery: PlayerQuery,
    private genreQuery: GenreQuery,
    private router: Router,
    private spotifyService: SpotifyService,
    public dialog: MatDialog,
    private _snackBar: MatSnackBar,
    private matIconRegistry: MatIconRegistry,
    private domSanitizer: DomSanitizer,
    private fns: AngularFireFunctions
  ) {}

  ngOnInit() {
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
            if (tokens.custom_auth_token) {
              const user = await this.afAuth.signInWithCustomToken(
                tokens.custom_auth_token
              );
              this.authStore.setActive(user.user.uid);
              this.authService.syncCollection();
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

    // this.spotifyService.initializePlayer();

    // Shows spinner to user.
    this.isTrackstoreLoading$ = this.trackQuery.selectLoading();

    this.isTrackStoreEmpty$ = this.trackQuery
      .selectCount()
      .pipe(map((length) => (length === 0 ? true : false)));

    //this.trackService.setFirestoreTracks();
    this.isSpinning$ = this.trackQuery.selectSpinner();

    this.matIconRegistry.addSvgIcon(
      'arrow',
      this.domSanitizer.bypassSecurityTrustResourceUrl(
        `../assets/purple_arrow.svg`
      )
    );

    this.trackNumber$ = this.trackService.tracksLength$;
    this.playingTrack$ = this.playerQuery.selectActive();
    // Updates spinner to false to disable loading page if page is reloaded.
    this.trackService.updateSpinner(false);
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

  public loadPlaylist() {
    this.trackService.updateSpinner(true);
    const user = this.authQuery.getActive();
    const saveFunction = this.fns.httpsCallable('saveUserPlaylists');
    const response = saveFunction({
      user,
    })
      .pipe(first())
      .subscribe((tracks) => {
        this.trackService.setStore(tracks);
        this.trackService.updateSpinner(false);
      });
    this.loadTop50Tracks();
  }

  private async loadTop50Tracks() {
    // Gets user's top 50 tracks.
    this.userTopTracks = await this.spotifyService.getActiveUserTopTracks();
    console.log(this.userTopTracks);
    // Changes top track to display every 3.5s
    this.userTopTrack$ = timer(0, 3500).pipe(
      // Activates fade in animation
      tap((_) => (this.fadeInState = true)),
      map((n) => this.userTopTracks[n]),
      take(50)
    );

    this.animationSub = this.userTopTrack$.subscribe((_) => {
      this.fadeInState = false;
    });
  }

  public playAll() {
    this.trackService
      .selectFilteredTracks()
      .pipe(
        map((tracks) => tracks.map((track) => track.uri)),
        tap(async (trackUris) => await this.spotifyService.play(trackUris)),
        first()
      )
      .subscribe();
  }

  public savePlaylist() {
    this.openDialog();
  }

  openDialog(): void {
    const dialogRef = this.dialog.open(PlaylistFormComponent, {
      width: '250px',
    });

    dialogRef.afterClosed().subscribe(async (result) => {
      if (result) {
        // creates the playlist and get the result from Spotify
        const playlist: Playlist = await this.spotifyService.createPlaylist(
          result
        );
        // add tracks to the newly created playlist
        this.trackService
          .selectFilteredTracks()
          .pipe(
            tap((tracks) =>
              this.spotifyService.addTracksToPlaylistByBatches(
                playlist.id,
                tracks
              )
            ),
            first()
          )
          .subscribe((_) => this.openSnackBar('Playlist saved!'));
      }
    });
  }

  private openSnackBar(message: string) {
    this._snackBar.open(message, '', {
      duration: 2000,
    });
  }

  public signOut() {
    this.authService.signOut();
  }

  public async addRecommended() {
    const genreIds = this.genreQuery.topGenres.map((genre) => genre.id);
    const activeTrackIds = this.trackQuery
      .getActive()
      .map((track) => track.id)
      .slice(0, 3);
    const filters = this.trackService.getFilters();

    const recommendedTracks =
      await this.spotifyService.getPromisedRecommendations(
        [],
        genreIds,
        activeTrackIds,
        filters
      );
    if (recommendedTracks) {
      this.trackService.add(recommendedTracks);
      console.log(recommendedTracks);
      const trackIds = recommendedTracks.map((track) => track.id);

      this.trackService.addActive(trackIds);
    }
  }

  ngOnDestroy() {
    this.animationSub.unsubscribe();
  }
}
