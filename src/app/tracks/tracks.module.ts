import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TrackListComponent } from './track-list/track-list.component';
import { TrackViewComponent } from './track-view/track-view.component';
import { MatCardModule } from '@angular/material/card';

@NgModule({
  declarations: [TrackListComponent, TrackViewComponent],
  imports: [CommonModule, MatCardModule],
  exports: [TrackListComponent, TrackViewComponent],
})
export class TracksModule {}
