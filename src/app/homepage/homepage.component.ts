import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Observable } from 'rxjs';
import { AuthService, SpotifyUser } from '../auth/+state';
import { Track, TrackQuery, TrackService } from '../tracks/+state';

@Component({
  selector: 'app-homepage',
  templateUrl: './homepage.component.html',
  styleUrls: ['./homepage.component.css'],
})
export class HomepageComponent implements OnInit {
  spotifyUser$: Observable<SpotifyUser>;
  activeTrack$: Observable<Track>;

  constructor(
    private authService: AuthService,
    private trackService: TrackService,
    private trackQuery: TrackQuery,
    private router: Router
  ) {}

  async ngOnInit() {
    const url = this.router.url;
    if (!url.includes('access_token')) {
      this.authService.authSpotify();
    }
    this.authService.saveToken();
    this.spotifyUser$ = await this.authService.getSpotifyActiveUser();
    this.trackService.initializePlayer();
    this.activeTrack$ = this.trackQuery.selectActive();
  }
}
