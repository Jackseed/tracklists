import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { MediaObserver } from '@ngbracket/ngx-layout';
import { MatSlideToggleChange } from '@angular/material/slide-toggle';
import { Observable } from 'rxjs';
import { TrackService } from '../../tracks/+state';
import { Playlist, PlaylistQuery, PlaylistService } from '../+state';

@Component({
  selector: 'app-playlist-list',
  templateUrl: './playlist-list.component.html',
  styleUrls: ['./playlist-list.component.css'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class PlaylistListComponent implements OnInit {
  private query = inject(PlaylistQuery);
  private service = inject(PlaylistService);
  private trackService = inject(TrackService);
  public media = inject(MediaObserver);

  playlists$: Observable<Playlist[]>;

  ngOnInit(): void {
    this.playlists$ = this.query.selectAll();
  }

  public setAllActive(event: MatSlideToggleChange) {
    const playlistIds = this.query.getAll().map((playlist) => playlist.id);
    if (event.checked) {
      this.trackService.addAllActive();
      this.service.addActive(playlistIds);
    } else {
      this.trackService.removeAllActive();
      this.service.removeActive(playlistIds);
    }
  }
}
