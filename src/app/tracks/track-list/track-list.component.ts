import { Component, OnInit } from '@angular/core';
import { Observable } from 'rxjs';
import { Track, TrackQuery } from '../+state';

@Component({
  selector: 'app-track-list',
  templateUrl: './track-list.component.html',
  styleUrls: ['./track-list.component.css'],
})
export class TrackListComponent implements OnInit {
  public tracks$: Observable<Track[]>;

  constructor(private query: TrackQuery) {}

  ngOnInit(): void {
    this.tracks$ = this.query.selectAll({
      limitTo: 100,
      filterBy: ({ energy }) => 0.4 < energy && energy < 0.5,
      sortBy: 'name',
    });
  }
}
