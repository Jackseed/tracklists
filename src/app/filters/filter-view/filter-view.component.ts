import { Component, Input, OnInit } from '@angular/core';
import { TrackService } from 'src/app/tracks/+state';

@Component({
  selector: 'app-filter-view',
  templateUrl: './filter-view.component.html',
  styleUrls: ['./filter-view.component.css'],
})
export class FilterViewComponent implements OnInit {
  @Input() filteredProperty: string;
  rangeValues: number[] = [0, 0];

  constructor(private trackService: TrackService) {}

  ngOnInit(): void {}

  public onChange() {
    this.trackService.setFilter({
      id: this.filteredProperty,
      value: this.rangeValues,
      predicate: (entity) =>
        this.rangeValues[0] < entity[this.filteredProperty] &&
        entity[this.filteredProperty] < this.rangeValues[1],
    });
  }
}
