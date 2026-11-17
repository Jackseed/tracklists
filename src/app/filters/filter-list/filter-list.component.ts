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

  /** Icons are Material Symbols: add new names to the icon font link in index.html. */
  public readonly filters: FilterDefinition[] = [
    { property: 'energy', label: 'Energy', min: 'Sleepy', minIcon: 'bedtime', max: 'Dynamic', maxIcon: 'bolt', extremeValues: this.unit, step: 0.01, format: 'percent' },
    { property: 'danceability', label: 'Danceability', min: 'Chill', minIcon: 'weekend', max: 'Dancy', maxIcon: 'nightlife', extremeValues: this.unit, step: 0.01, format: 'percent' },
    { property: 'valence', label: 'Mood', min: 'Gloomy', minIcon: 'rainy', max: 'Joyful', maxIcon: 'sunny', extremeValues: this.unit, step: 0.01, format: 'percent' },
    { property: 'tempo', label: 'Tempo', min: 'Slow', minIcon: 'directions_walk', max: 'Fast', maxIcon: 'directions_run', extremeValues: this.trackQuery.getExtremeTempos, step: 1, format: 'bpm' },
    { property: 'release_year', label: 'Release year', min: 'Old', minIcon: 'history', max: 'New', maxIcon: 'new_releases', extremeValues: this.trackQuery.getExtremeReleaseYears, step: 1, format: 'year' },
    { property: 'popularity', label: 'Popularity', min: 'Hidden gem', minIcon: 'diamond', max: 'Hit', maxIcon: 'star', extremeValues: { min: 0, max: 100 }, step: 1, format: 'number' },
    { property: 'instrumentalness', label: 'Instrumental', min: 'Sung', minIcon: 'mic', max: 'Instrumental', maxIcon: 'piano', extremeValues: this.unit, step: 0.01, format: 'percent', more: true },
    { property: 'acousticness', label: 'Acoustic', min: 'Electronic', minIcon: 'memory', max: 'Acoustic', maxIcon: 'nature', extremeValues: this.unit, step: 0.01, format: 'percent', more: true },
    { property: 'liveness', label: 'Live', min: 'Studio', minIcon: 'headphones', max: 'Live', maxIcon: 'stadium', extremeValues: this.unit, step: 0.01, format: 'percent', more: true },
  ];
}
