import { Component, Input, OnInit } from '@angular/core';
import { Playlist } from '../+state';

@Component({
  selector: 'app-playlist-view',
  templateUrl: './playlist-view.component.html',
  styleUrls: ['./playlist-view.component.css'],
})
export class PlaylistViewComponent implements OnInit {
  @Input() playlist: Playlist;

  constructor() {}

  ngOnInit(): void {}
}
