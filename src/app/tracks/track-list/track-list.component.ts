 import { Component, OnInit } from '@angular/core';
import { Observable } from 'rxjs';
import { Track, TrackService } from '../+state';

@Component({
  selector: 'app-track-list',
  templateUrl: './track-list.component.html',
  styleUrls: ['./track-list.component.css'],
})
export class TrackListComponent implements OnInit {
  public tracks$: Observable<Track[]>;

  constructor(private service: TrackService) {}

  ngOnInit(): void {
    this.tracks$ = this.service.selectAll();
  }
}
