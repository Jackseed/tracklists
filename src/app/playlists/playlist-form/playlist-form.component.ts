import { Component, OnInit } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';

@Component({
  selector: 'app-playlist-form',
  templateUrl: './playlist-form.component.html',
  styleUrls: ['./playlist-form.component.css'],
})
export class PlaylistFormComponent implements OnInit {
  public name: string;
  constructor(public dialogRef: MatDialogRef<PlaylistFormComponent>) {}

  ngOnInit(): void {}
}
