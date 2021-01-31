import { Component, OnInit } from '@angular/core';
import { TrackQuery } from 'src/app/tracks/+state';

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
      property: 'release_year',
      label: 'Release Year',
      min: 'sleep',
      max: 'coffee',
      extremeValues: this.extremeYears,
      step: 1,
    },
    {
      property: 'tempo',
      label: 'BPM',
      min: 'sleep',
      max: 'coffee',
      extremeValues: this.extremeTempos,
      step: 1,
    },
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
      label: 'Dancy',
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
      min: 'sleep',
      max: 'coffee',
      extremeValues: {
        min: 0,
        max: 100,
      },
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
      label: 'Accoustic',
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
  constructor(private trackQuery: TrackQuery) {}

  ngOnInit(): void {}
}
