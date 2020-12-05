import { Component, OnInit } from '@angular/core';
import { AuthService } from '../auth/+state';
import { PlaylistService } from '../playlists/+state';
import { SpotifyService } from '../spotify/spotify.service';

@Component({
  selector: 'app-navbar',
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.css'],
})
export class NavbarComponent implements OnInit {
  constructor(
    public authService: AuthService,
    public spotifyService: SpotifyService,
    public playlistService: PlaylistService
  ) {}

  ngOnInit(): void {}
}
