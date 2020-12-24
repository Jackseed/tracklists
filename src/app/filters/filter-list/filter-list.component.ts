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
      min: 'sleepy',
      max: 'energy',
    },
    {
      property: 'instrumentalness',
      label: 'Instrumental',
      min: 'sleepy',
      max: 'energy',
    },
    {
      property: 'danceability',
      label: 'Dancy',
      min: 'sleepy',
      max: 'energy',
    },
    {
      property: 'acousticness',
      label: 'Accoustic',
      min: 'sleepy',
      max: 'energy',
    },
    {
      property: 'liveness',
      label: 'Live music',
      min: 'sleepy',
      max: 'energy',
    },
    {
      property: 'speechiness',
      label: 'Lyrics',
      min: 'sleepy',
      max: 'energy',
    },
    {
      property: 'valence',
      label: 'Happyness',
      min: 'sleepy',
      max: 'energy',
    },
  ];
  constructor() {}

  ngOnInit(): void {}
}
