import { Component, Input, OnInit } from '@angular/core';
import { MatIconRegistry } from '@angular/material/icon';
import { DomSanitizer } from '@angular/platform-browser';
import { TrackService } from 'src/app/tracks/+state';

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
  };
  rangeValues: number[] = [0, 1];

  constructor(
    private trackService: TrackService,
    private matIconRegistry: MatIconRegistry,
    private domSanitizer: DomSanitizer
  ) {}

  ngOnInit(): void {
    this.matIconRegistry.addSvgIcon(
      this.filter.min,
      this.domSanitizer.bypassSecurityTrustResourceUrl(
        `../../assets/${this.filter.min}.svg`
      )
    );
    this.matIconRegistry.addSvgIcon(
      this.filter.max,
      this.domSanitizer.bypassSecurityTrustResourceUrl(
        `../../assets/${this.filter.max}.svg`
      )
    );
  }

  public onChange() {
    // convert value to 0-100 for Popularity
    if (this.filter.property === 'popularity') {
      this.trackService.setFilter({
        id: this.filter.property,
        value: this.rangeValues.map((value) => value * 100),
        predicate: (track) =>
          this.rangeValues[0] * 100 < track[this.filter.property] &&
          track[this.filter.property] < this.rangeValues[1] * 100,
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
