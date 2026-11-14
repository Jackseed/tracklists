import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatIconRegistry } from '@angular/material/icon';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class AppComponent {
  title = 'Tracklists';

  constructor() {
    // <mat-icon>name</mat-icon> uses Material Symbols Rounded (see index.html for the loaded glyphs).
    inject(MatIconRegistry).setDefaultFontSetClass('material-symbols-rounded');
  }
}
