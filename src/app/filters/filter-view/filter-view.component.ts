import { Component, OnInit } from '@angular/core';
import { TrackService } from 'src/app/tracks/+state';

@Component({
  selector: 'app-filter-view',
  templateUrl: './filter-view.component.html',
  styleUrls: ['./filter-view.component.css'],
})
export class FilterViewComponent implements OnInit {
  rangeValues: number[] = [0, 0];

  constructor(private trackService: TrackService) {}

  ngOnInit(): void {}

  public onChange() {
    this.trackService.setFilter({
      id: 'energy',
      value: this.rangeValues,
      predicate: (entity) =>
        this.rangeValues[0] < entity.energy &&
        entity.energy < this.rangeValues[1],
    });
  }
}
