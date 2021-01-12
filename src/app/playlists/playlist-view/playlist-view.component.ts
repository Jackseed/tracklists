import { Component, Input, OnInit } from '@angular/core';
import { MatCheckboxChange } from '@angular/material/checkbox';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { GenreService } from 'src/app/filters/genre-filters/+state';
import { TrackService } from 'src/app/tracks/+state';
import { Playlist, PlaylistQuery, PlaylistStore } from '../+state';

@Component({
  selector: 'app-playlist-view',
  templateUrl: './playlist-view.component.html',
  styleUrls: ['./playlist-view.component.css'],
})
export class PlaylistViewComponent implements OnInit {
  @Input() playlist: Playlist;
  public isActive$: Observable<boolean>;

  constructor(
    private store: PlaylistStore,
    private query: PlaylistQuery,
    private genreService: GenreService,
    private trackService: TrackService
  ) {}

  ngOnInit(): void {
    this.isActive$ = this.query
      .selectActiveId()
      .pipe(map((playlistIds) => playlistIds.includes(this.playlist.id)));
  }

  public setActive(event: MatCheckboxChange) {
    this.store.toggleActive(this.playlist.id);
    this.genreService.toggle(this.playlist.id);
    if (event.checked) {
      this.trackService.addActive(this.playlist);
    } else {
      this.trackService.removeActive(this.playlist);
    }
  }
}
