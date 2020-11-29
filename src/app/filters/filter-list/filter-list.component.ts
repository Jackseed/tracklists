import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-filter-list',
  templateUrl: './filter-list.component.html',
  styleUrls: ['./filter-list.component.css'],
})
export class FilterListComponent implements OnInit {
  filters = [
    'energy',
    'instrumentalness',
    'danceability',
    'acousticness',
    'liveness',
    'speechiness',
    'valence',
  ];
  constructor() {}

  ngOnInit(): void {}
}
