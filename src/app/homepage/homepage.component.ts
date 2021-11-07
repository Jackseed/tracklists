import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Observable } from 'rxjs';
import { AuthQuery, AuthService } from '../auth/+state';
import { SpotifyService } from '../spotify/spotify.service';
import { Track, TrackQuery, TrackService } from '../tracks/+state';
import { first, map, tap } from 'rxjs/operators';
import { Playlist, PlaylistQuery } from 'src/app/playlists/+state';
import { PlaylistFormComponent } from 'src/app/playlists/playlist-form/playlist-form.component';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatIconRegistry } from '@angular/material/icon';
import { DomSanitizer } from '@angular/platform-browser';
import { PlayerQuery, PlayerTrack } from '../player/+state';
import { GenreQuery } from '../filters/genre-filters/+state';
import { AngularFireFunctions } from '@angular/fire/functions';
import { AngularFirestore } from '@angular/fire/firestore';

@Component({
  selector: 'app-homepage',
  templateUrl: './homepage.component.html',
  styleUrls: ['./homepage.component.css'],
})
export class HomepageComponent implements OnInit {
  public spotifyUserId$: Observable<string>;
  public trackNumber$: Observable<number>;
  public isTrackstoreLoading$: Observable<boolean>;
  public playingTrack$: Observable<PlayerTrack>;
  public isSpinning$: Observable<boolean>;
  public isTrackStoreEmpty$: Observable<boolean>;
  public loadingItem$: Observable<string>;

  constructor(
    private authQuery: AuthQuery,
    private authService: AuthService,
    private playlistQuery: PlaylistQuery,
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
    private fns: AngularFireFunctions,
    private afs: AngularFirestore
  ) {}

  async ngOnInit() {
    const user = this.authQuery.getActive();
    const url = this.router.url;
    // check if there is already a code registered, otherwise save it
    if (!url.includes('code')) {
      this.authService.authSpotify();
    }
    this.authService.saveSpotifyCode();
    // if first connexion, get an access token from spotify
    if (!user.tokens) {
      const user = this.authQuery.getActive();
      const url = this.router.url;
      const code = url.substring(url.indexOf('=') + 1);

      const getTokenFunction = this.fns.httpsCallable('getSpotifyToken');
      const response = getTokenFunction({
        code: code,
        tokenType: 'access',
        userId: user.id,
      })
        .pipe(first())
        .subscribe();
    }

    this.spotifyUserId$ = this.authQuery.selectSpotifyUserId();

    this.spotifyService.initializePlayer();

    // Tracks loading
    this.isTrackstoreLoading$ = this.trackQuery.selectLoading();
    this.loadingItem$ = this.trackQuery.selectLoadingItem();
    this.isTrackStoreEmpty$ = this.trackQuery
      .selectCount()
      .pipe(map((length) => (length === 0 ? true : false)));
    this.trackService.setFirestoreTracks();
    this.isSpinning$ = this.trackQuery.selectSpinner();

    this.matIconRegistry.addSvgIcon(
      'arrow',
      this.domSanitizer.bypassSecurityTrustResourceUrl(
        `../assets/purple_arrow.svg`
      )
    );

    this.trackNumber$ = this.trackService.tracksLength$;
    this.playingTrack$ = this.playerQuery.selectActive();
    // update spinner to false to disable loading page if page is reloaded
    this.trackService.updateSpinner(false);

    this.afs.collection('playlists').valueChanges().subscribe(console.log);
    this.afs.collection('tracks').valueChanges().subscribe(console.log);
  }

  public loginSpotify() {
    this.authService.authSpotify();
  }

  public loadPlaylist() {
    const user = this.authQuery.getActive();
    console.log('here', user);

    const saveFunction = this.fns.httpsCallable('saveUserPlaylists');
    const response = saveFunction({
      user,
    })
      .pipe(first())
      .subscribe(console.log);
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

  public refreshData() {
    const user = this.authQuery.getActive();
    const saveFunction = this.fns.httpsCallable('saveUserPlaylists');
    const response = saveFunction({
      user,
    })
      .pipe(first())
      .subscribe(console.log);
    /*
    this.spotifyService.savePlaylists(); */
    this.trackService.updateSpinner(true);
    this.trackService.loadFromFirebase();
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
}
