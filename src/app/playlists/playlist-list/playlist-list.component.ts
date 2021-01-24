import { Component, OnInit } from '@angular/core';
import { MatCheckboxChange } from '@angular/material/checkbox';
import { Observable } from 'rxjs';
import { first, map, tap } from 'rxjs/operators';
import { GenreService } from 'src/app/filters/genre-filters/+state';
import { TrackService } from 'src/app/tracks/+state';
import { Playlist, PlaylistQuery, PlaylistService } from '../+state';

@Component({
  selector: 'app-playlist-list',
  templateUrl: './playlist-list.component.html',
  styleUrls: ['./playlist-list.component.css'],
})
export class PlaylistListComponent implements OnInit {
  playlists$: Observable<Playlist[]>;

  constructor(
    private query: PlaylistQuery,
    private service: PlaylistService,
    private trackService: TrackService,
    private genreService: GenreService
  ) {}

  ngOnInit(): void {
    this.playlists$ = this.query.selectAll();
  }

  public setAllActive(event: MatCheckboxChange) {
    this.playlists$
      .pipe(
        map((playlist) => playlist.map((playlist) => playlist.id)),
        tap((playlistIds) => {
          if (event.checked) {
            this.trackService.addAllActive();
            this.service.addActive(playlistIds);
            this.genreService.addAllActive();
          } else {
            this.trackService.removeAllActive();
            this.service.removeActive(playlistIds);
            this.genreService.removeAllActive();
          }
        }),
        first()
      )
      .subscribe();
  }
}
