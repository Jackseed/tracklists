import { Component, OnInit } from '@angular/core';
import { FormControl } from '@angular/forms';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { TrackService } from 'src/app/tracks/+state';

@UntilDestroy()
@Component({
  selector: 'app-filter-view',
  templateUrl: './filter-view.component.html',
  styleUrls: ['./filter-view.component.css'],
})
export class FilterViewComponent implements OnInit {
  public filter = new FormControl();
  rangeValues: number[];

  constructor(private trackService: TrackService) {}

  ngOnInit(): void {
    this.filter.valueChanges.pipe(untilDestroyed(this)).subscribe((energy) => {
      this.trackService.setFilter({
        id: 'energy',
        value: energy,
        predicate: (entity) => entity.energy === energy,
      });
    });
  }
}
