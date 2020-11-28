import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TrackListComponent } from './track-list/track-list.component';
import { TrackViewComponent } from './track-view/track-view.component';
import { MatCardModule } from '@angular/material/card';
import { FlexLayoutModule } from '@angular/flex-layout';

@NgModule({
  declarations: [TrackListComponent, TrackViewComponent],
  imports: [CommonModule, MatCardModule, FlexLayoutModule],
  exports: [TrackListComponent, TrackViewComponent],
})
export class TracksModule {}
