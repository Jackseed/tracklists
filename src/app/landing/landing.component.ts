// Angular
import { Component, OnInit } from '@angular/core';
import { DomSanitizer, Meta } from '@angular/platform-browser';
import { Router } from '@angular/router';
// Material
import { MatIconRegistry } from '@angular/material/icon';
// Animations
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
    private router: Router,
    private meta: Meta
  ) {
    this.matIconRegistry.addSvgIcon(
      'shovel',
      this.domSanitizer.bypassSecurityTrustResourceUrl(
        '../../assets/buttons/shovel.svg'
      )
    );
  }

  ngOnInit(): void {
    this.meta.addTags([
      { name: 'title', content: 'Tracklists' },
      {
        name: 'description',
        content:
          "Filter your Spotify music library using parameters like genre, danceability, energy or BPM. Save it as a tracklist and repeat. It's free and open source.",
      },
      {
        name: 'keywords',
        content:
          'Music, Spotify, Filters, Playlist, Free, Open source, Library',
      },
      { name: 'robots', content: 'index, follow' },
      { name: 'author', content: 'JackSeed' },
      {
        name: 'og:url',
        content: `https://tracklists.io`,
      },
      { name: 'og:title', content: 'Tracklists' },
      {
        name: 'og:description',
        content:
          "Filter your Spotify music library using parameters like genre, danceability, energy or BPM. Save it as a tracklist and repeat. It's free and open source.",
      },
      {
        name: 'og:image',
        content:
          'https://firebasestorage.googleapis.com/v0/b/listy-prod.appspot.com/o/tracklists-logo.png?alt=media&token=03541895-fe6a-4617-88e0-c62fd10b16a2',
      },
    ]);
  }

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
