import { Component, Input, OnInit } from '@angular/core';
import { TrackService, Track } from '../tracks/+state';
import { SecToMinPipe } from '../utils/sec-to-min.pipe';

@Component({
  selector: 'app-player',
  templateUrl: './player.component.html',
  styleUrls: ['./player.component.css'],
})
export class PlayerComponent implements OnInit {
  @Input() track: Track;
  constructor(private service: TrackService) {}

  ngOnInit(): void {}

  public play(trackUri: string) {
    this.service.play([trackUri]);
  }
  public pause() {
    this.service.pause();
  }
  public playNext() {
    this.service.playNext();
  }
}
