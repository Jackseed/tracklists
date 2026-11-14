import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TrackListComponent } from './track-list/track-list.component';
import { TrackViewComponent } from './track-view/track-view.component';
import { FlexLayoutModule } from '@ngbracket/ngx-layout';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';

@NgModule({
  declarations: [TrackListComponent, TrackViewComponent],
  imports: [
    CommonModule,
    FlexLayoutModule,
    MatButtonModule,
    MatIconModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
  exports: [TrackListComponent, TrackViewComponent],
})
export class TracksModule {}
