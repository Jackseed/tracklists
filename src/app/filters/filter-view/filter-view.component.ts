import { Component, Input, OnInit } from '@angular/core';
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
  };
  rangeValues: number[] = [0, 0];

  constructor(private trackService: TrackService) {}

  ngOnInit(): void {}

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
