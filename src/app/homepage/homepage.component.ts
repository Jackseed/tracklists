import { Component, OnInit } from '@angular/core';
import { AuthService } from '../auth/+state';

@Component({
  selector: 'app-homepage',
  templateUrl: './homepage.component.html',
  styleUrls: ['./homepage.component.css'],
})
export class HomepageComponent implements OnInit {
  constructor(public authService: AuthService) {

  }

  ngOnInit(): void {
    this.authService.saveToken();
  }
}
