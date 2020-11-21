import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TrackListComponent } from './track-list/track-list.component';
import { TrackViewComponent } from './track-view/track-view.component';



@NgModule({
  declarations: [TrackListComponent, TrackViewComponent],
  imports: [
    CommonModule
  ]
})
export class TracksModule { }
