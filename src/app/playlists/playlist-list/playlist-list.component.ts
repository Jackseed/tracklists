import { Component, OnInit } from '@angular/core';
import { MediaObserver } from '@angular/flex-layout';
import { MatCheckboxChange } from '@angular/material/checkbox';
import { Observable } from 'rxjs';
import { first, map, tap } from 'rxjs/operators';
import { GenreService } from '../../filters/genre-filters/+state';
import { TrackService } from '../../tracks/+state';
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
    private genreService: GenreService,
    public media: MediaObserver
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
          } else {
            this.trackService.removeAllActive();
            this.service.removeActive(playlistIds);
          }
        }),
        tap((playlistIds) =>
          playlistIds.map((playlistId) => {
            if (event.checked) {
              this.genreService.addPlaylistGenres(playlistId);
            } else {
              this.genreService.removePlaylistGenres(playlistId);
            }
          })
        ),
        first()
      )
      .subscribe();
  }
}
