// Angular
import { Component, OnDestroy, OnInit } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
// Rxjs
import { Observable, of, Subscription, timer } from 'rxjs';
import { first, map, take, tap } from 'rxjs/operators';
// Angularfire
import {
  Functions,
  httpsCallable,
  HttpsCallableResult,
} from '@angular/fire/functions';
// States
import { AuthQuery, AuthService, User } from '../auth/+state';
import { SpotifyService } from '../spotify/spotify.service';
import { Track, TrackQuery, TrackService } from '../tracks/+state';
import { Playlist, PlaylistQuery } from 'src/app/playlists/+state';
import { PlayerQuery, PlayerTrack } from '../player/+state';
import { GenreQuery } from '../filters/genre-filters/+state';
// Components
import { PlaylistFormComponent } from 'src/app/playlists/playlist-form/playlist-form.component';
// Flex layout
import { MediaObserver } from '@angular/flex-layout';
// Material
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatIconRegistry } from '@angular/material/icon';
// Animations
import { fadeInAnimation, fadeInOnEnterAnimation } from 'angular-animations';

@Component({
  selector: 'app-homepage',
  templateUrl: './homepage.component.html',
  styleUrls: ['./homepage.component.css'],
  animations: [fadeInOnEnterAnimation(), fadeInAnimation({ duration: 1500 })],
})
export class HomepageComponent implements OnInit, OnDestroy {
  public user$: Observable<User>;
  public trackNumber$: Observable<number>;
  public playingTrack$: Observable<PlayerTrack>;
  public isSpinning$: Observable<boolean>;
  public arePlaylistLoaded$: Observable<boolean>;
  public areTracksLoaded$: Observable<boolean>;
  public userTopTracks: Track[];
  public userTopTrack$: Observable<Track | boolean> = of(false);
  public fadeInState: boolean = false;
  private animationSub: Subscription;

  constructor(
    private authQuery: AuthQuery,
    private authService: AuthService,
    private trackQuery: TrackQuery,
    private trackService: TrackService,
    private playlistQuery: PlaylistQuery,
    private playerQuery: PlayerQuery,
    private genreQuery: GenreQuery,
    private spotifyService: SpotifyService,
    public dialog: MatDialog,
    private _snackBar: MatSnackBar,
    private matIconRegistry: MatIconRegistry,
    private domSanitizer: DomSanitizer,
    private functions: Functions,
    public media: MediaObserver
  ) {
    this.matIconRegistry.addSvgIcon(
      'curvy-arrow',
      this.domSanitizer.bypassSecurityTrustResourceUrl(
        `../assets/curvy_arrow.svg`
      )
    );
    this.matIconRegistry.addSvgIcon(
      'straight-arrow',
      this.domSanitizer.bypassSecurityTrustResourceUrl(
        `../assets/straight-arrow.svg`
      )
    );
    this.matIconRegistry.addSvgIcon(
      'tracklists-empty',
      this.domSanitizer.bypassSecurityTrustResourceUrl(
        '../assets/navbar/tracklists-empty.svg'
      )
    );
    this.matIconRegistry.addSvgIcon(
      'tracklists-fill',
      this.domSanitizer.bypassSecurityTrustResourceUrl(
        '../assets/navbar/tracklists-fill.svg'
      )
    );
    this.matIconRegistry.addSvgIcon(
      'playlists-empty',
      this.domSanitizer.bypassSecurityTrustResourceUrl(
        '../assets/navbar/playlists-empty.svg'
      )
    );
    this.matIconRegistry.addSvgIcon(
      'playlists-fill',
      this.domSanitizer.bypassSecurityTrustResourceUrl(
        '../assets/navbar/playlists-fill.svg'
      )
    );
    this.matIconRegistry.addSvgIcon(
      'filters-empty',
      this.domSanitizer.bypassSecurityTrustResourceUrl(
        '../assets/navbar/filters-empty.svg'
      )
    );
    this.matIconRegistry.addSvgIcon(
      'filters-fill',
      this.domSanitizer.bypassSecurityTrustResourceUrl(
        '../assets/navbar/filters-fill.svg'
      )
    );
  }

  ngOnInit() {
    this.spotifyService.initializePlayer();
    // Shows spinner to user.
    this.isSpinning$ = this.trackQuery.selectSpinner();

    this.arePlaylistLoaded$ = this.playlistQuery
      .selectCount()
      .pipe(map((length) => (length === 0 ? false : true)));
    this.areTracksLoaded$ = this.trackQuery
      .selectCount()
      .pipe(map((length) => (length === 0 ? false : true)));

    this.trackService.setFirestoreTracks();

    this.trackNumber$ = this.trackService.tracksLength$;
    this.playingTrack$ = this.playerQuery.selectActive();
  }

  public async loadPlaylist() {
    this.trackService.updateSpinner(true);
    const user = this.authQuery.getActive();
    const saveFunction = httpsCallable(this.functions, 'saveUserPlaylists');

    saveFunction({ user })
      .then((response: HttpsCallableResult<Track[]>) => {
        const tracks = response.data;
        console.log(tracks);
        this.trackService.setStore(tracks);
        this.trackService.updateSpinner(false);
      })
      .catch((err) => console.log(err));
    this.loadTop50Tracks();
  }

  private async loadTop50Tracks() {
    // Gets user's top 50 tracks.
    this.userTopTracks = await this.spotifyService.getActiveUserTopTracks();
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
      width: '400px',
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
    if (this.animationSub) this.animationSub.unsubscribe();
  }
}
