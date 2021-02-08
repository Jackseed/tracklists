import { Component, OnInit } from '@angular/core';
import { TrackQuery, TrackService } from 'src/app/tracks/+state';

@Component({
  selector: 'app-filter-list',
  templateUrl: './filter-list.component.html',
  styleUrls: ['./filter-list.component.css'],
})
export class FilterListComponent implements OnInit {
  extremeYears = this.trackQuery.getExtremeReleaseYears;
  extremeTempos = this.trackQuery.getExtremeTempos;
  filters = [
    {
      property: 'energy',
      label: 'Energy',
      min: 'sleep',
      max: 'coffee',
      extremeValues: {
        min: 0,
        max: 1,
      },
      step: 0.01,
    },
    {
      property: 'danceability',
      label: 'Danceability',
      min: 'armchair',
      max: 'disco',
      extremeValues: {
        min: 0,
        max: 1,
      },
      step: 0.01,
    },
    {
      property: 'valence',
      label: 'Happyness',
      min: 'rainy',
      max: 'sun',
      extremeValues: {
        min: 0,
        max: 1,
      },
      step: 0.01,
    },
    {
      property: 'popularity',
      label: 'Popularity',
      min: 'question',
      max: 'star',
      extremeValues: {
        min: 0,
        max: 100,
      },
      step: 1,
    },
    {
      property: 'release_year',
      label: 'Release Year',
      min: 'phonogram',
      max: 'ipod',
      extremeValues: this.extremeYears,
      step: 1,
    },
    {
      property: 'tempo',
      label: 'BPM',
      min: 'bump',
      max: 'pulse',
      extremeValues: this.extremeTempos,
      step: 1,
    },
    {
      property: 'instrumentalness',
      label: 'Instrumental',
      min: 'sing',
      max: 'note',
      extremeValues: {
        min: 0,
        max: 1,
      },
      step: 0.01,
    },
    {
      property: 'acousticness',
      label: 'Acoustic',
      min: 'electronic',
      max: 'piano',
      extremeValues: {
        min: 0,
        max: 1,
      },
      step: 0.01,
    },
    {
      property: 'liveness',
      label: 'Live music',
      min: 'headset',
      max: 'tickets',
      extremeValues: {
        min: 0,
        max: 1,
      },
      step: 0.01,
    },
  ];
  constructor(
    private trackQuery: TrackQuery,
    private trackService: TrackService
  ) {}

  public clearFilters() {
    this.trackService.clearFilters();
  }

  ngOnInit(): void {}
}
