// Angular
import { Component, Input, OnInit } from '@angular/core';
// Rxjs
import { Observable } from 'rxjs';
import { first, map, tap } from 'rxjs/operators';
// States
import { Track, TrackQuery, TrackService } from '../+state';
import { PlaylistQuery, PlaylistService } from '../../playlists/+state';
import { SpotifyService } from '../../spotify/spotify.service';
import { PlayerQuery } from '../../player/+state';
// Flex layout
import { MediaObserver } from '@angular/flex-layout';
// Material
import { MatSnackBar } from '@angular/material/snack-bar';

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
    private _snackBar: MatSnackBar,
    public media: MediaObserver
  ) {}

  ngOnInit(): void {
    this.isLiked$ = this.query.isLiked$(this.track.id);
    this.isPlaying$ = this.playerQuery
      .selectActiveId()
      .pipe(map((trackId) => trackId === this.track.id));
  }

  // play playback from the selected track
  public async play() {
    this.service
      .selectFilteredTracks()
      .pipe(
        map((tracks) => tracks.map((track) => track.uri)),
        // remove the tracks before the selected one
        map((ids) => {
          const index = ids.indexOf(this.track.uri);
          return ids.slice(index);
        }),
        tap(async (ids) => await this.spotifyService.play(ids)),
        first()
      )
      .subscribe();
  }
  public async addoToPlayback() {
    await this.spotifyService.addToPlayback(this.track.uri);
    this._snackBar.open('Added to queue', '', {
      duration: 2000,
    });
  }
  public remove() {
    this.service.removeActive([this.track.id]);
    this._snackBar.open('Removed from tracklist', '', {
      duration: 2000,
    });
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
