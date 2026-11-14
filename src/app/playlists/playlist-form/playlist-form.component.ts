import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';

@Component({
  selector: 'app-playlist-form',
  templateUrl: './playlist-form.component.html',
  styleUrls: ['./playlist-form.component.css'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class PlaylistFormComponent {
  public name: string;
  constructor(public dialogRef: MatDialogRef<PlaylistFormComponent>) {}
}
