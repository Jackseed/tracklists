import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TrackQuery, TrackService } from '../../tracks/+state';

@Component({
  selector: 'app-filter-list',
  templateUrl: './filter-list.component.html',
  styleUrls: ['./filter-list.component.css'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class FilterListComponent {
  private trackQuery = inject(TrackQuery);
  private trackService = inject(TrackService);

  extremeYears = this.trackQuery.getExtremeReleaseYears;
  extremeTempos = this.trackQuery.getExtremeTempos;
  filters = [
    {
      property: 'energy',
      label: 'Energy',
      min: 'Sleepy',
      max: 'Dynamic',
      extremeValues: {
        min: 0,
        max: 1,
      },
      step: 0.01,
    },
    {
      property: 'danceability',
      label: 'Danceability',
      min: 'Chill',
      max: 'Dancy',
      extremeValues: {
        min: 0,
        max: 1,
      },
      step: 0.01,
    },
    {
      property: 'valence',
      label: 'Happyness',
      min: 'Gloomy',
      max: 'Joyful',
      extremeValues: {
        min: 0,
        max: 1,
      },
      step: 0.01,
    },
    {
      property: 'popularity',
      label: 'Popularity',
      min: 'Unknown',
      max: 'Star',
      extremeValues: {
        min: 0,
        max: 100,
      },
      step: 1,
    },
    {
      property: 'release_year',
      label: 'Release Year',
      min: 'Old',
      max: 'New',
      extremeValues: this.extremeYears,
      step: 1,
    },
    {
      property: 'tempo',
      label: 'BPM',
      min: 'Low',
      max: 'High',
      extremeValues: this.extremeTempos,
      step: 1,
    },
    {
      property: 'instrumentalness',
      label: 'Instrumental',
      min: 'A capella',
      max: 'Instrumental',
      extremeValues: {
        min: 0,
        max: 1,
      },
      step: 0.01,
    },
    {
      property: 'acousticness',
      label: 'Acoustic',
      min: 'Electronic',
      max: 'Acoustic',
      extremeValues: {
        min: 0,
        max: 1,
      },
      step: 0.01,
    },
    {
      property: 'liveness',
      label: 'Live music',
      min: 'Studio',
      max: 'Live',
      extremeValues: {
        min: 0,
        max: 1,
      },
      step: 0.01,
    },
  ];
  public clearFilters() {
    this.trackService.clearFilters();
  }
}
