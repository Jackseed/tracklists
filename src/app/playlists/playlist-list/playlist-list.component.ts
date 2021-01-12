import { Component, OnInit } from '@angular/core';
import { MatCheckboxChange } from '@angular/material/checkbox';
import { Observable } from 'rxjs';
import { map, take, tap } from 'rxjs/operators';
import { GenreService } from 'src/app/filters/genre-filters/+state';
import { TrackService } from 'src/app/tracks/+state';
import { Playlist, PlaylistQuery, PlaylistStore } from '../+state';

@Component({
  selector: 'app-playlist-list',
  templateUrl: './playlist-list.component.html',
  styleUrls: ['./playlist-list.component.css'],
})
export class PlaylistListComponent implements OnInit {
  playlists$: Observable<Playlist[]>;

  constructor(
    private query: PlaylistQuery,
    private store: PlaylistStore,
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
        tap((playlistIds) =>
          playlistIds.map((playlistId) => {
            const playlist = this.query.getEntity(playlistId);
            this.store.toggleActive(playlistId);
            this.genreService.toggle(playlistId);
            if (event.checked) {
              this.trackService.addActive(playlist);
            } else {
              this.trackService.removeActive(playlist);
            }
          })
        ),
        take(1)
      )
      .subscribe();
  }
}
