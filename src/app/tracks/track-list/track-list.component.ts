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
import { Observable } from 'rxjs';
import { first, map, tap } from 'rxjs/operators';
import { Playlist } from 'src/app/playlists/+state';
import { PlaylistFormComponent } from 'src/app/playlists/playlist-form/playlist-form.component';
import { SpotifyService } from 'src/app/spotify/spotify.service';
import { Track, TrackQuery, TrackService } from '../+state';

@Component({
  selector: 'app-track-list',
  templateUrl: './track-list.component.html',
  styleUrls: ['./track-list.component.css'],
})
export class TrackListComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('anchor') anchor: ElementRef<HTMLElement>;
  public tracks$: Observable<Track[]>;
  public page: number = 0;

  private observer: IntersectionObserver;

  constructor(
    private query: TrackQuery,
    private service: TrackService,
    private spotifyService: SpotifyService,
    public dialog: MatDialog,
    private _snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.tracks$ = this.service.selectPage(this.query.getPage());
    this.observer = new IntersectionObserver(([entry]) => {
      entry.isIntersecting && this.onScroll();
    });
  }

  ngAfterViewInit() {
    this.observer.observe(this.anchor.nativeElement);
  }

  public onScroll() {
    this.page++;
    console.log('hello world');
    this.tracks$ = this.service.selectPage(this.page);
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
    // this.spotifyService.createPlaylist('yo');
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
