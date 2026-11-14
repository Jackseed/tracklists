import { ChangeDetectionStrategy, Component, Input, OnInit, inject } from '@angular/core';
import { MatCheckboxChange } from '@angular/material/checkbox';
import { Observable } from 'rxjs';
import { distinctUntilChanged, map } from 'rxjs/operators';
import { TrackService } from '../../tracks/+state';
import { Playlist, PlaylistQuery, PlaylistService } from '../+state';

@Component({
  selector: 'app-playlist-view',
  templateUrl: './playlist-view.component.html',
  styleUrls: ['./playlist-view.component.css'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class PlaylistViewComponent implements OnInit {
  private service = inject(PlaylistService);
  private query = inject(PlaylistQuery);
  private trackService = inject(TrackService);

  @Input() playlist: Playlist;
  public isActive$: Observable<boolean>;

  ngOnInit(): void {
    this.isActive$ = this.query.selectActiveId().pipe(
      map((playlistIds: string[]) => (playlistIds ?? []).includes(this.playlist.id)),
      distinctUntilChanged()
    );
  }

  public setActive(event: MatCheckboxChange) {
    if (event.checked) {
      this.service.addActive([this.playlist.id]);
      this.trackService.addActive(this.playlist.trackIds);
    } else {
      this.service.removeActive([this.playlist.id]);
      this.trackService.removeActive(this.playlist.trackIds);
    }
  }
}
