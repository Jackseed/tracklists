import { Component, OnInit } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Observable } from 'rxjs';
import { first, map, tap } from 'rxjs/operators';
import { PlaylistFormComponent } from 'src/app/playlists/playlist-form/playlist-form.component';
import { SpotifyService } from 'src/app/spotify/spotify.service';
import { Track, TrackService } from '../+state';

export interface DialogData {
  name: string;
}

@Component({
  selector: 'app-track-list',
  templateUrl: './track-list.component.html',
  styleUrls: ['./track-list.component.css'],
})
export class TrackListComponent implements OnInit {
  public tracks$: Observable<Track[]>;
  public name: string;

  constructor(
    private service: TrackService,
    private spotifyService: SpotifyService,
    public dialog: MatDialog
  ) {}

  ngOnInit(): void {
    this.tracks$ = this.service.selectAll();
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
      data: { name: this.name },
    });

    dialogRef.afterClosed().subscribe((result) => {
      console.log('The dialog was closed ', result);
      this.name = result;
    });
  }
}
