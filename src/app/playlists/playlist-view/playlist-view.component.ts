import { Component, Input, OnInit } from '@angular/core';
import { MatCheckboxChange } from '@angular/material/checkbox';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { GenreService } from 'src/app/filters/genre-filters/+state';
import { TrackService } from 'src/app/tracks/+state';
import { Playlist, PlaylistQuery, PlaylistService } from '../+state';

@Component({
  selector: 'app-playlist-view',
  templateUrl: './playlist-view.component.html',
  styleUrls: ['./playlist-view.component.css'],
})
export class PlaylistViewComponent implements OnInit {
  @Input() playlist: Playlist;
  public isActive$: Observable<boolean>;

  constructor(
    private service: PlaylistService,
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
    this.service.toggleActive(this.playlist.id);
    this.trackService.toggleActive(this.playlist.trackIds);
    if (event.checked) {
      this.genreService.addActive(this.playlist.genreIds, this.playlist.id);
    } else {
      this.genreService.removeActive(this.playlist.genreIds, this.playlist.id);
    }
  }
}
