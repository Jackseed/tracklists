// Angular
import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { DomSanitizer, Meta } from '@angular/platform-browser';
import { Router } from '@angular/router';
// Material
import { MatIconRegistry } from '@angular/material/icon';

@Component({
  selector: 'app-landing',
  templateUrl: './landing.component.html',
  styleUrls: ['./landing.component.css'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class LandingComponent implements OnInit {
  /** The first background shapes beat while "Dig it!" is hovered or focused. */
  beating = false;
  /** The big shape of the "filters" section turns while a "Let's ..." button is hovered or focused. */
  rocking = false;

  constructor(
    private matIconRegistry: MatIconRegistry,
    private domSanitizer: DomSanitizer,
    private router: Router,
    private meta: Meta
  ) {
    this.matIconRegistry.addSvgIcon(
      'shovel',
      this.domSanitizer.bypassSecurityTrustResourceUrl(
        'assets/buttons/shovel.svg'
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
}
