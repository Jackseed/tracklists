import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { TrackQuery, TrackService } from '../../tracks/+state';
import { GenreService } from '../genre-filters/+state';

/**
 * Every filter in one place: match count, genres, sliders and "Reset all".
 * Shown as the right column on wide screens and in the bottom sheet on phones.
 */
@Component({
  selector: 'app-filter-panel',
  templateUrl: './filter-panel.component.html',
  styleUrls: ['./filter-panel.component.css'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class FilterPanelComponent {
  private trackService = inject(TrackService);
  private trackQuery = inject(TrackQuery);
  private genreService = inject(GenreService);

  /** In the bottom sheet: a "Show N tracks" button closes it. */
  @Input() sheet = false;
  @Output() done = new EventEmitter<void>();

  /** Tracks left by the filters, out of the tracks of the selected playlists. */
  readonly shown$: Observable<number> = this.trackService.tracksLength$;
  readonly selected$: Observable<number> = this.trackQuery.selectActiveId().pipe(map((ids) => ((ids ?? []) as string[]).length));
  readonly activeCount$: Observable<number> = this.trackService.selectFilters().pipe(map((filters) => filters.length));

  public resetAll() {
    this.genreService.clearActive();
    this.trackService.clearFilters();
  }
}
