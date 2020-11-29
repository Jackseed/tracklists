import { Component, OnInit } from '@angular/core';
import { Track } from '../tracks/+state';

@Component({
  selector: 'app-filters',
  templateUrl: './filters.component.html',
  styleUrls: ['./filters.component.css']
})
export class FiltersComponent implements OnInit {

  tracks: Track[];
  filteredTracks: Track[];

  filters = {};

  constructor() { }

  ngOnInit(): void {
  }

  

}
