import { ChangeDetectionStrategy, Component, Input, OnInit, inject } from '@angular/core';
import { MatIconRegistry } from '@angular/material/icon';
import { DomSanitizer } from '@angular/platform-browser';
import { MinMax, Track, TrackService } from '../../tracks/+state';

@Component({
  selector: 'app-filter-view',
  templateUrl: './filter-view.component.html',
  styleUrls: ['./filter-view.component.css'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class FilterViewComponent implements OnInit {
  private trackService = inject(TrackService);
  private matIconRegistry = inject(MatIconRegistry);
  private domSanitizer = inject(DomSanitizer);

  @Input() filter: {
    label: string;
    property: string;
    min: string;
    max: string;
    extremeValues: MinMax;
    step: number;
  };
  rangeValues: number[];

  ngOnInit(): void {
    this.rangeValues = [this.filter.extremeValues.min, this.filter.extremeValues.max];
    for (const icon of [this.filter.min, this.filter.max]) {
      this.matIconRegistry.addSvgIcon(icon, this.domSanitizer.bypassSecurityTrustResourceUrl(`assets/filters/${icon}.svg`));
    }
  }

  /** The slider moved: `range` is its new [min, max]. */
  public onChange(range: number[]) {
    this.rangeValues = range;
    const [min, max] = range;
    const { property, extremeValues } = this.filter;
    // Back to the full range: no filter, so tracks without this information are listed again.
    if (min <= extremeValues.min && max >= extremeValues.max) return this.trackService.removeFilter(property);
    // release year is more nested
    const read = property === 'release_year' ? (track: Track) => track.album?.release_year : (track: Track) => track[property];
    this.trackService.setFilter({
      id: property,
      value: [min, max],
      predicate: (track) => {
        const value = read(track);
        return typeof value === 'number' && min <= value && value <= max;
      },
    });
  }
}
