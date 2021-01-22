import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Observable } from 'rxjs';
import { AuthQuery, AuthService, SpotifyUser, User } from '../auth/+state';
import { SpotifyService } from '../spotify/spotify.service';
import { TrackQuery, TrackService } from '../tracks/+state';
import { first, map, tap } from 'rxjs/operators';
import { Playlist, PlaylistQuery } from 'src/app/playlists/+state';
import { PlaylistFormComponent } from 'src/app/playlists/playlist-form/playlist-form.component';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatIconRegistry } from '@angular/material/icon';
import { DomSanitizer } from '@angular/platform-browser';
import { PlayerQuery, PlayerTrack } from '../player/+state';

@Component({
  selector: 'app-homepage',
  templateUrl: './homepage.component.html',
  styleUrls: ['./homepage.component.css'],
})
export class HomepageComponent implements OnInit {
  public spotifyUser$: Observable<SpotifyUser>;
  public user$: Observable<User>;
  public trackNumber$: Observable<number>;
  public activePlaylistIds$: Observable<string[]>;
  public isTrackstoreLoading$: Observable<boolean>;
  public playingTrack$: Observable<PlayerTrack>;
  public isSpinning$: Observable<boolean>;

  constructor(
    private authQuery: AuthQuery,
    private authService: AuthService,
    private trackQuery: TrackQuery,
    private trackService: TrackService,
    private playlistQuery: PlaylistQuery,
    private playerQuery: PlayerQuery,
    private router: Router,
    private spotifyService: SpotifyService,
    public dialog: MatDialog,
    private _snackBar: MatSnackBar,
    private matIconRegistry: MatIconRegistry,
    private domSanitizer: DomSanitizer
  ) {}

  async ngOnInit() {
    this.isTrackstoreLoading$ = this.trackQuery.selectLoading();
    this.trackService.setFirestoreTracks();
    this.isSpinning$ = this.trackQuery.selectSpinner();
    this.matIconRegistry.addSvgIcon(
      'arrow',
      this.domSanitizer.bypassSecurityTrustResourceUrl(
        `../assets/purple_arrow.svg`
      )
    );
    this.user$ = this.authQuery.selectActive();
    const url = this.router.url;
    if (!url.includes('access_token')) {
      this.authService.authSpotify();
    }
    this.authService.saveToken();
    this.spotifyUser$ = await this.authService.getSpotifyActiveUser();
    this.spotifyService.initializePlayer();
    this.trackNumber$ = this.trackService.tracksLength$;
    this.playingTrack$ = this.playerQuery.selectActive();

    this.activePlaylistIds$ = this.playlistQuery.selectActiveId() as Observable<
      string[]
    >;
  }

  public loginSpotify() {
    this.authService.authSpotify();
  }

  public loadPlaylist() {
    this.spotifyService.savePlaylists();
    this.trackService.updateSpinner(true);
  }

  public playAll() {
    this.trackService
      .selectAll()
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
          .selectAll()
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
    this.spotifyService.savePlaylists();
    this.trackService.updateSpinner(true);
  }

  public signOut() {
    this.authService.signOut();
  }
}
