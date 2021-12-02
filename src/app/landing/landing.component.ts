import { Component, OnInit } from '@angular/core';
import { MatIconRegistry } from '@angular/material/icon';
import { DomSanitizer } from '@angular/platform-browser';
import { Router } from '@angular/router';
import {
  heartBeatAnimation,
  pulseAnimation,
  rotateAnimation,
} from 'angular-animations';

@Component({
  selector: 'app-landing',
  templateUrl: './landing.component.html',
  styleUrls: ['./landing.component.css'],
  animations: [
    pulseAnimation({ duration: 3000, scale: 1.1 }),
    heartBeatAnimation({ duration: 2000, scale: 1.1 }),
    rotateAnimation({ duration: 2000 }),
  ],
})
export class LandingComponent implements OnInit {
  animating = [false, false, false];
  animStates = [false, false, false];

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

  toggleAnimation(animNumber: number) {
    this.animating[animNumber] = !this.animating[animNumber];
    this.animStates[animNumber] = !this.animStates[animNumber];
  }

  animDone(animNumber: number) {
    if (this.animating[animNumber]) {
      this.animStates[animNumber] = !this.animStates[animNumber];
    }
  }

  loopDone() {
    this.animStates[3] = !this.animStates[3];
  }
}
