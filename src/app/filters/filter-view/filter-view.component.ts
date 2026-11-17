import { ChangeDetectionStrategy, Component, DestroyRef, Input, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatIconRegistry } from '@angular/material/icon';
import { DomSanitizer } from '@angular/platform-browser';
import { MinMax, Track, TrackService } from '../../tracks/+state';

export interface FilterDefinition {
  property: string;
  label: string;
  /** Words for both ends (tooltips), and their icons (`src/assets/filters/<icon>.svg`). */
  min: string;
  minIcon: string;
  max: string;
  maxIcon: string;
  extremeValues: MinMax;
  step: number;
  format: 'percent' | 'number' | 'bpm' | 'year';
  /** Folded under "more" by default. */
  more?: boolean;
}

@Component({
  selector: 'app-filter-view',
  templateUrl: './filter-view.component.html',
  styleUrls: ['./filter-view.component.css'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class FilterViewComponent implements OnInit {
  private trackService = inject(TrackService);
  private destroyRef = inject(DestroyRef);
  private iconRegistry = inject(MatIconRegistry);
  private sanitizer = inject(DomSanitizer);

  @Input() filter: FilterDefinition;
  rangeValues: number[];

  ngOnInit(): void {
    const { min, max } = this.filter.extremeValues;
    this.rangeValues = [min, max];
    for (const icon of [this.filter.minIcon, this.filter.maxIcon]) {
      this.iconRegistry.addSvgIcon(icon, this.sanitizer.bypassSecurityTrustResourceUrl(`assets/filters/${icon}.svg`));
    }
    // The slider follows the filter: "Reset all", or the same filter shown elsewhere.
    this.trackService
      .selectFilters()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((filters) => {
        const value = filters.find((filter) => filter.id === this.filter.property)?.value;
        this.rangeValues = Array.isArray(value) ? value : [min, max];
      });
  }

  /** True when the slider leaves part of the range out. */
  get active(): boolean {
    const [min, max] = this.rangeValues;
    return min > this.filter.extremeValues.min || max < this.filter.extremeValues.max;
  }

  /** The selected range in words: "35 – 90%", "92 – 144 BPM", "1983 – 2010". */
  get valueText(): string {
    const [min, max] = this.rangeValues;
    switch (this.filter.format) {
      case 'percent':
        return `${Math.round(min * 100)} – ${Math.round(max * 100)}%`;
      case 'bpm':
        return `${Math.round(min)} – ${Math.round(max)} BPM`;
      default:
        return `${Math.round(min)} – ${Math.round(max)}`;
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
