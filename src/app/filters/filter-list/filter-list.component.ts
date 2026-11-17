import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TrackQuery } from '../../tracks/+state';
import { FilterDefinition } from '../filter-view/filter-view.component';

@Component({
  selector: 'app-filter-list',
  templateUrl: './filter-list.component.html',
  styleUrls: ['./filter-list.component.css'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class FilterListComponent {
  private trackQuery = inject(TrackQuery);

  /** The less common filters stay folded until asked for. */
  public showMore = false;

  private readonly unit = { min: 0, max: 1 };

  /** Icons: `src/assets/filters/<name>.svg`. */
  public readonly filters: FilterDefinition[] = [
    { property: 'energy', label: 'Energy', min: 'Sleepy', minIcon: 'Sleepy', max: 'Dynamic', maxIcon: 'Dynamic', extremeValues: this.unit, step: 0.01, format: 'percent' },
    { property: 'danceability', label: 'Danceability', min: 'Chill', minIcon: 'Chill', max: 'Dancy', maxIcon: 'Dancy', extremeValues: this.unit, step: 0.01, format: 'percent' },
    { property: 'valence', label: 'Mood', min: 'Gloomy', minIcon: 'Gloomy', max: 'Joyful', maxIcon: 'Joyful', extremeValues: this.unit, step: 0.01, format: 'percent' },
    { property: 'tempo', label: 'Tempo', min: 'Slow', minIcon: 'Low', max: 'Fast', maxIcon: 'High', extremeValues: this.trackQuery.getExtremeTempos, step: 1, format: 'bpm' },
    { property: 'release_year', label: 'Release year', min: 'Old', minIcon: 'Old', max: 'New', maxIcon: 'New', extremeValues: this.trackQuery.getExtremeReleaseYears, step: 1, format: 'year' },
    { property: 'popularity', label: 'Popularity', min: 'Hidden gem', minIcon: 'Unknown', max: 'Hit', maxIcon: 'Star', extremeValues: { min: 0, max: 100 }, step: 1, format: 'number' },
    { property: 'instrumentalness', label: 'Instrumental', min: 'Sung', minIcon: 'A capella', max: 'Instrumental', maxIcon: 'Instrumental', extremeValues: this.unit, step: 0.01, format: 'percent', more: true },
    { property: 'acousticness', label: 'Acoustic', min: 'Electronic', minIcon: 'Electronic', max: 'Acoustic', maxIcon: 'Acoustic', extremeValues: this.unit, step: 0.01, format: 'percent', more: true },
    { property: 'liveness', label: 'Live', min: 'Studio', minIcon: 'Studio', max: 'Live', maxIcon: 'Live', extremeValues: this.unit, step: 0.01, format: 'percent', more: true },
  ];
}
