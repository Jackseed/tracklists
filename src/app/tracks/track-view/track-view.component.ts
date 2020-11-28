import { Component, Input, OnInit } from '@angular/core';
import { Track } from '../+state';

@Component({
  selector: 'app-track-view',
  templateUrl: './track-view.component.html',
  styleUrls: ['./track-view.component.css'],
})
export class TrackViewComponent implements OnInit {
  @Input() track: Track;
  constructor() {}

  ngOnInit(): void {}
}
