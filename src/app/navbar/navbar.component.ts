import { Component, OnInit } from '@angular/core';
import { AuthService } from '../auth/+state';
import { TrackService } from '../tracks/+state';

@Component({
  selector: 'app-navbar',
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.css'],
})
export class NavbarComponent implements OnInit {
  constructor(
    public authService: AuthService,
    public trackService: TrackService
  ) {}

  ngOnInit(): void {}
}
