import { Component, OnInit } from '@angular/core';
import { MatIconRegistry } from '@angular/material/icon';
import { DomSanitizer } from '@angular/platform-browser';
import { Router } from '@angular/router';

@Component({
  selector: 'app-landing',
  templateUrl: './landing.component.html',
  styleUrls: ['./landing.component.css'],
})
export class LandingComponent implements OnInit {
  constructor(
    private matIconRegistry: MatIconRegistry,
    private domSanitizer: DomSanitizer,
    private router: Router
  ) {
    this.matIconRegistry.addSvgIcon(
      'shovel',
      this.domSanitizer.bypassSecurityTrustResourceUrl(
        '../../assets/buttons/shovel.svg'
      )
    );
  }

  ngOnInit(): void {}

  navigateToLogin() {
    this.router.navigate(['login']);
  }
}
