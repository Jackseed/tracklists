import { Component, OnInit } from '@angular/core';
import { Observable } from 'rxjs';
import { Playlist, PlaylistQuery, PlaylistStore } from '../+state';

@Component({
  selector: 'app-playlist-list',
  templateUrl: './playlist-list.component.html',
  styleUrls: ['./playlist-list.component.css'],
})
export class PlaylistListComponent implements OnInit {
  playlists$: Observable<Playlist[]>;

  constructor(private store: PlaylistStore, private query: PlaylistQuery) {}

  ngOnInit(): void {
    this.playlists$ = this.query.selectAll();
  }

  public setLikedTracksActive() {
    this.store.toggleActive('likedTracks');
  }
}
