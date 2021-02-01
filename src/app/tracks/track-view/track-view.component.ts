import { Component, Input, OnInit } from '@angular/core';
import { Observable } from 'rxjs';
import { SpotifyService } from 'src/app/spotify/spotify.service';
import { Track, TrackQuery, TrackService } from '../+state';
import { MatSnackBar } from '@angular/material/snack-bar';
import { PlaylistQuery, PlaylistService } from 'src/app/playlists/+state';
import { first, map, tap } from 'rxjs/operators';
import { PlayerQuery } from 'src/app/player/+state';

@Component({
  selector: 'app-track-view',
  templateUrl: './track-view.component.html',
  styleUrls: ['./track-view.component.css'],
})
export class TrackViewComponent implements OnInit {
  @Input() track: Track;
  isLiked$: Observable<boolean>;
  isPlaying$: Observable<boolean>;

  constructor(
    private query: TrackQuery,
    private service: TrackService,
    private spotifyService: SpotifyService,
    private playlistQuery: PlaylistQuery,
    private playlistService: PlaylistService,
    private playerQuery: PlayerQuery,
    private _snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.isLiked$ = this.query.isLiked$(this.track.id);
    this.isPlaying$ = this.playerQuery
      .selectActiveId()
      .pipe(map((trackId) => trackId === this.track.id));
  }

  public async play() {
    await this.spotifyService.play([this.track.uri]);
  }
  public async addoToPlayback() {
    await this.spotifyService.addToPlayback(this.track.uri);
  }
  public remove() {
    this.service.removeActive([this.track.id]);
  }

  public async like() {
    const likedTracksPlaylist$ = this.playlistQuery.likedTracksPlaylist;
    likedTracksPlaylist$
      .pipe(
        tap(async (playlist) => {
          this.playlistService.addTrack(playlist.id, this.track.id);
          await this.spotifyService.addToLikedTracks(this.track.id);
          this._snackBar.open('Added to Liked tracks', '', {
            duration: 2000,
          });
        }),
        first()
      )
      .subscribe();
  }

  public async unlike() {
    const likedTracksPlaylist$ = this.playlistQuery.likedTracksPlaylist;
    likedTracksPlaylist$
      .pipe(
        tap(async (playlist) => {
          this.playlistService.removeTrack(playlist.id, this.track.id);
          await this.spotifyService.removeFromLikedTracks(this.track.id);
          this._snackBar.open('Removed from Liked tracks', '', {
            duration: 2000,
          });
        }),
        first()
      )
      .subscribe();
  }
}
