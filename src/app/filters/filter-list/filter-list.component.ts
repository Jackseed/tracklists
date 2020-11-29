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
    },
    {
      property: 'instrumentalness',
      label: 'Instrumental',
    },
    {
      property: 'danceability',
      label: 'Dancy',
    },
    {
      property: 'acousticness',
      label: 'Accoustic',
    },
    {
      property: 'liveness',
      label: 'Live music',
    },
    {
      property: 'speechiness',
      label: 'Lyrics',
    },
    {
      property: 'valence',
      label: 'Happyness',
    },
  ];
  constructor() {}

  ngOnInit(): void {}
}
