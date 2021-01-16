import { Component, Input, OnInit } from '@angular/core';
import { SpotifyService } from 'src/app/spotify/spotify.service';
import { Track, TrackService } from '../+state';

@Component({
  selector: 'app-track-view',
  templateUrl: './track-view.component.html',
  styleUrls: ['./track-view.component.css'],
})
export class TrackViewComponent implements OnInit {
  @Input() track: Track;
  constructor(
    private service: TrackService,
    private spotifyService: SpotifyService
  ) {}

  ngOnInit(): void {}

  public async play(trackUri: string) {
    await this.spotifyService.play([trackUri]);
  }
  public async addoToPlayback(trackUri: string) {
    await this.spotifyService.addToPlayback(trackUri);
  }
  public remove() {
    this.service.removeActive([this.track.id]);
  }
}
