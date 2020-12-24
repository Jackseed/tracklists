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
    this.trackService.setFilter({
      id: this.filter.property,
      value: this.rangeValues,
      predicate: (entity) =>
        this.rangeValues[0] < entity[this.filter.property] &&
        entity[this.filter.property] < this.rangeValues[1],
    });
  }
}
