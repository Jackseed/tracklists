// Angular
import { ChangeDetectionStrategy, Component, Input, OnInit, inject } from '@angular/core';
// Rxjs
import { firstValueFrom, Observable } from 'rxjs';
import { map } from 'rxjs/operators';
// States
import { Track, TrackQuery, TrackService } from '../+state';
import { PlaylistQuery, PlaylistService } from '../../playlists/+state';
import { playbackErrorMessage, SpotifyService } from '../../spotify/spotify.service';
import { PlayerQuery } from '../../player/+state';
// Flex layout
import { MediaObserver } from '@ngbracket/ngx-layout';
// Material
import { MatSnackBar } from '@angular/material/snack-bar';

@Component({
  selector: 'app-track-view',
  templateUrl: './track-view.component.html',
  styleUrls: ['./track-view.component.css'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class TrackViewComponent implements OnInit {
  private query = inject(TrackQuery);
  private service = inject(TrackService);
  private spotifyService = inject(SpotifyService);
  private playlistQuery = inject(PlaylistQuery);
  private playlistService = inject(PlaylistService);
  private playerQuery = inject(PlayerQuery);
  private snackBar = inject(MatSnackBar);
  public media = inject(MediaObserver);

  @Input() track: Track;
  isLiked$: Observable<boolean>;
  isPlaying$: Observable<boolean>;

  ngOnInit(): void {
    this.isLiked$ = this.query.isLiked$(this.track.id);
    this.isPlaying$ = this.playerQuery.selectActiveId().pipe(map((trackId) => trackId === this.track.id));
  }

  /** CSS value for the album cover; some tracks have none. */
  get cover(): string | null {
    const url = this.track.album?.images?.[0]?.url;
    return url ? `url(${url})` : null;
  }

  // play playback from the selected track
  public async play() {
    try {
      const uris = (await firstValueFrom(this.service.selectFilteredTracks())).map((track) => track.uri);
      // remove the tracks before the selected one
      await this.spotifyService.play(uris.slice(Math.max(0, uris.indexOf(this.track.uri))));
    } catch (error) {
      this.fail(playbackErrorMessage(error, 'Spotify could not start the playback.'), error);
    }
  }

  public async addoToPlayback() {
    try {
      await this.spotifyService.addToPlayback(this.track.uri);
      this.notify('Added to queue');
    } catch (error) {
      this.fail('Could not add the track to the queue.', error);
    }
  }

  public remove() {
    this.service.removeActive([this.track.id]);
    this.notify('Removed from tracklist');
  }

  public async like() {
    try {
      const playlist = await firstValueFrom(this.playlistQuery.likedTracksPlaylist);
      await this.spotifyService.addToLikedTracks(this.track.id);
      if (playlist) await this.playlistService.addTrack(playlist.id, this.track.id);
      this.notify('Added to Liked tracks');
    } catch (error) {
      this.fail('Could not like the track.', error);
    }
  }

  public async unlike() {
    try {
      const playlist = await firstValueFrom(this.playlistQuery.likedTracksPlaylist);
      await this.spotifyService.removeFromLikedTracks(this.track.id);
      if (playlist) await this.playlistService.removeTrack(playlist.id, this.track.id);
      this.notify('Removed from Liked tracks');
    } catch (error) {
      this.fail('Could not unlike the track.', error);
    }
  }

  private notify(message: string) {
    this.snackBar.open(message, '', { duration: 2000 });
  }

  private fail(message: string, error: unknown) {
    console.error(`[TrackView] ${message}`, error);
    this.snackBar.open(message, '', { duration: 4000 });
  }
}
