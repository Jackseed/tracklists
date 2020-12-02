import { Component, Input, OnInit } from '@angular/core';
import { Track, TrackService } from '../+state';

@Component({
  selector: 'app-track-view',
  templateUrl: './track-view.component.html',
  styleUrls: ['./track-view.component.css'],
})
export class TrackViewComponent implements OnInit {
  @Input() track: Track;
  constructor(private service: TrackService) {}

  ngOnInit(): void {}

  public play(trackUri: string) {
    this.service.play([trackUri]);
  }
  public addoToPlayback(trackUri: string) {
    this.service.addToPlayback(trackUri);
  }
}
