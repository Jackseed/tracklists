import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { combineLatest, Observable } from 'rxjs';
import { first, map, tap } from 'rxjs/operators';
import { Playlist } from 'src/app/playlists/+state';
import { PlaylistFormComponent } from 'src/app/playlists/playlist-form/playlist-form.component';
import { SpotifyService } from 'src/app/spotify/spotify.service';
import { Track, TrackService } from '../+state';

@Component({
  selector: 'app-track-list',
  templateUrl: './track-list.component.html',
  styleUrls: ['./track-list.component.css'],
})
export class TrackListComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('anchor') anchor: ElementRef<HTMLElement>;
  private observer: IntersectionObserver;
  public tracks$: Observable<Track[]>;
  public trackNumber$: Observable<number>;
  public page: number = 0;
  public hasMore$: Observable<boolean>;

  constructor(
    private service: TrackService,
    private spotifyService: SpotifyService,
    public dialog: MatDialog,
    private _snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.tracks$ = this.service.getMore(this.page);
    this.observer = new IntersectionObserver(([entry]) => {
      entry.isIntersecting && this.onScroll();
    });

    this.trackNumber$ = this.service
      .selectAll()
      .pipe(map((tracks) => tracks.length));

    this.hasMore$ = combineLatest([this.tracks$, this.trackNumber$]).pipe(
      map(([tracks, total]) => (tracks.length === total ? false : true))
    );
  }

  ngAfterViewInit() {
    this.observer.observe(this.anchor.nativeElement);
  }

  public onScroll() {
    this.page++;
    this.tracks$ = this.service.getMore(this.page);
  }

  public playAll() {
    this.tracks$
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
        const playlist: Playlist = await this.spotifyService.createPlaylist(
          result
        );
        console.log(playlist);
        this.tracks$
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

  ngOnDestroy() {
    this.observer.disconnect();
  }
}
