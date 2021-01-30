import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-filter-list',
  templateUrl: './filter-list.component.html',
  styleUrls: ['./filter-list.component.css'],
})
export class FilterListComponent implements OnInit {
  filters = [
    {
      property: 'energy',
      label: 'Energy',
      min: 'sleep',
      max: 'coffee',
    },
    {
      property: 'danceability',
      label: 'Dancy',
      min: 'armchair',
      max: 'disco',
    },
    {
      property: 'valence',
      label: 'Happyness',
      min: 'rainy',
      max: 'sun',
    },
    {
      property: 'popularity',
      label: 'Popularity',
      min: 'sleep',
      max: 'coffee',
    },
    {
      property: 'instrumentalness',
      label: 'Instrumental',
      min: 'sing',
      max: 'note',
    },
    {
      property: 'acousticness',
      label: 'Accoustic',
      min: 'electronic',
      max: 'piano',
    },
    {
      property: 'liveness',
      label: 'Live music',
      min: 'headset',
      max: 'tickets',
    },
  ];
  constructor() {}

  ngOnInit(): void {}
}
