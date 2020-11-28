import { Component, OnInit } from '@angular/core';
import { AuthService } from '../auth/+state';
import { TrackService } from '../tracks/+state';

@Component({
  selector: 'app-homepage',
  templateUrl: './homepage.component.html',
  styleUrls: ['./homepage.component.css'],
})
export class HomepageComponent implements OnInit {
  spotifyUser;


  constructor(
    public authService: AuthService,
    public trackService: TrackService
  ) {}

  async ngOnInit() {
    this.authService.saveToken();
    this.spotifyUser = await this.authService.getSpotifyActiveUser();
  }
}
