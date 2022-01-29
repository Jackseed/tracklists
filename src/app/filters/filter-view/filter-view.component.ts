import { Component, Input, OnInit } from '@angular/core';
import { MatIconRegistry } from '@angular/material/icon';
import { DomSanitizer } from '@angular/platform-browser';
import { MinMax, TrackService } from '../../tracks/+state';

@Component({
  selector: 'app-filter-view',
  templateUrl: './filter-view.component.html',
  styleUrls: ['./filter-view.component.css'],
})
export class FilterViewComponent implements OnInit {
  @Input() filter: {
    label: string;
    property: string;
    min: string;
    max: string;
    extremeValues: MinMax;
    step: number;
  };
  rangeValues: number[];

  constructor(
    private trackService: TrackService,
    private matIconRegistry: MatIconRegistry,
    private domSanitizer: DomSanitizer
  ) {}

  ngOnInit(): void {
    this.rangeValues = [
      this.filter.extremeValues.min,
      this.filter.extremeValues.max,
    ];
    this.matIconRegistry.addSvgIcon(
      this.filter.min,
      this.domSanitizer.bypassSecurityTrustResourceUrl(
        `../../assets/filters/${this.filter.min}.svg`
      )
    );
    this.matIconRegistry.addSvgIcon(
      this.filter.max,
      this.domSanitizer.bypassSecurityTrustResourceUrl(
        `../../assets/filters/${this.filter.max}.svg`
      )
    );
  }

  public onChange() {
    // release year is more nested
    if (this.filter.property === 'release_year') {
      this.trackService.setFilter({
        id: this.filter.property,
        value: this.rangeValues,
        predicate: (track) =>
          this.rangeValues[0] < track.album[this.filter.property] &&
          track.album[this.filter.property] < this.rangeValues[1],
      });
    } else {
      this.trackService.setFilter({
        id: this.filter.property,
        value: this.rangeValues,
        predicate: (track) =>
          this.rangeValues[0] < track[this.filter.property] &&
          track[this.filter.property] < this.rangeValues[1],
      });
    }
  }
}
