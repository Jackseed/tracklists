import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Observable } from 'rxjs';
import { AuthService, SpotifyUser } from '../auth/+state';
import { GenreService } from '../filters/genre-filters/+state';
import { SpotifyService } from '../spotify/spotify.service';
import { Track, TrackQuery } from '../tracks/+state';

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
    private spotifyService: SpotifyService,
    private trackQuery: TrackQuery,
    private genreService: GenreService,
    private router: Router,

  ) {}

  async ngOnInit() {
    const url = this.router.url;
    if (!url.includes('access_token')) {
      this.authService.authSpotify();
    }
    this.authService.saveToken();
    this.spotifyUser$ = await this.authService.getSpotifyActiveUser();
    this.spotifyService.initializePlayer();
    this.activeTrack$ = this.trackQuery.selectActive();
    // this.genreService.syncGenresWithPlaylists();
  }


}
