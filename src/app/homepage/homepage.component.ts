import { Component, OnInit } from '@angular/core';
import { AuthService } from '../auth/+state';

@Component({
  selector: 'app-homepage',
  templateUrl: './homepage.component.html',
  styleUrls: ['./homepage.component.css'],
})
export class HomepageComponent implements OnInit {
  spotifyUser;

  constructor(public authService: AuthService) {

  }

  async ngOnInit() {
    this.authService.saveToken();
    this.spotifyUser = await this.authService.getSpotifyActiveUser();
  }
}
