import { Component, OnInit } from '@angular/core';
import { MatCheckboxChange } from '@angular/material/checkbox';
import { Observable } from 'rxjs';
import { first, map, tap } from 'rxjs/operators';
import {
  GenreQuery,
  GenreService,
  GenreStore,
} from 'src/app/filters/genre-filters/+state';
import { TrackService } from 'src/app/tracks/+state';
import { Playlist, PlaylistQuery, PlaylistService } from '../+state';

@Component({
  selector: 'app-playlist-list',
  templateUrl: './playlist-list.component.html',
  styleUrls: ['./playlist-list.component.css'],
})
export class PlaylistListComponent implements OnInit {
  playlists$: Observable<Playlist[]>;
  activePlaylists$: Observable<Playlist[]>;

  constructor(
    private query: PlaylistQuery,
    private service: PlaylistService,
    private trackService: TrackService,
    private genreStore: GenreStore,
    private genreQuery: GenreQuery,
    private genreService: GenreService
  ) {}

  ngOnInit(): void {
    this.playlists$ = this.query.selectAll();
    this.activePlaylists$ = this.query.selectActive();

    this.activePlaylists$.pipe(
      map((playlists) =>
        playlists.map((playlist) =>
          playlist.genreIds.map((genreId) => {
            const genre = this.genreQuery.getEntity(genreId);
            this.genreStore.ui.update(genreId, {
              activeTrackIds: genre.playlists[playlist.id],
            });
          })
        )
      )
    ).subscribe();
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
            // setTimeout((_) => this.genreService.addAllActive(), 2000);
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
