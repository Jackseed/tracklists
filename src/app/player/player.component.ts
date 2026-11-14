import { ChangeDetectionStrategy, Component, DestroyRef, Input, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom, Observable } from 'rxjs';
import { filter, switchMap } from 'rxjs/operators';
import { PlaylistQuery, PlaylistService } from '../playlists/+state';
import { SpotifyService } from '../spotify/spotify.service';
import { Track, TrackQuery } from '../tracks/+state';
import { PlayerQuery } from './+state';

@Component({
  selector: 'app-player',
  templateUrl: './player.component.html',
  styleUrls: ['./player.component.css'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class PlayerComponent implements OnInit {
  private query = inject(PlayerQuery);
  private trackQuery = inject(TrackQuery);
  private playlistQuery = inject(PlaylistQuery);
  private playlistService = inject(PlaylistService);
  private spotifyService = inject(SpotifyService);
  private snackBar = inject(MatSnackBar);
  private destroyRef = inject(DestroyRef);

  @Input() track$: Observable<Track>;
  paused$: Observable<boolean>;
  shuffle$: Observable<boolean>;
  isLiked$: Observable<boolean>;
  /** Position in the track, in seconds. */
  value = 0;
  private ticker?: number;

  ngOnInit(): void {
    const currentTrack$ = this.track$.pipe(filter((track) => !!track));
    this.isLiked$ = currentTrack$.pipe(switchMap((track) => this.trackQuery.isLiked$(track.id)));

    // get track position
    currentTrack$
      .pipe(
        switchMap((track) => this.query.selectPosition(track.id)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((position) => (this.value = (position ?? 0) / 1000));

    this.paused$ = currentTrack$.pipe(switchMap((track) => this.query.selectPaused(track.id)));
    this.shuffle$ = this.query.selectShuffle();

    // while the track is played, add 1 to value every sec
    this.paused$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((paused) => {
      this.stopTicking();
      if (paused) return;
      this.ticker = window.setInterval(() => {
        const activeTrack = this.query.getActive();
        if (activeTrack && this.value <= activeTrack.duration_ms / 1000) this.value += 1;
      }, 1000);
    });
    this.destroyRef.onDestroy(() => this.stopTicking());
  }

  private stopTicking() {
    if (this.ticker !== undefined) window.clearInterval(this.ticker);
    this.ticker = undefined;
  }

  /** CSS value for the album cover; some tracks have none. */
  cover(track: Track): string | null {
    const url = track.album?.images?.[0]?.url;
    return url ? `url(${url})` : null;
  }

  public play() {
    return this.spotifyService.play().catch((error) => this.fail('Spotify could not start the playback.', error));
  }

  public pause() {
    return this.spotifyService.pause().catch((error) => this.fail('Spotify could not pause the playback.', error));
  }

  public previous() {
    return this.spotifyService.previous().catch((error) => this.fail('Spotify could not go to the previous track.', error));
  }

  public next() {
    return this.spotifyService.next().catch((error) => this.fail('Spotify could not go to the next track.', error));
  }

  /** The user released the position slider. */
  public onChangeSlider() {
    return this.spotifyService.seekPosition(Math.round(this.value * 1000)).catch((error) => this.fail('Spotify could not move in the track.', error));
  }

  public shuffle() {
    return this.spotifyService.shuffle(!this.query.getShuffle()).catch((error) => this.fail('Spotify could not change the shuffle mode.', error));
  }

  public async like(isLiked: boolean) {
    try {
      const [playlist, track] = await Promise.all([firstValueFrom(this.playlistQuery.likedTracksPlaylist), firstValueFrom(this.track$)]);
      if (!track) return;
      if (isLiked) {
        await this.spotifyService.addToLikedTracks(track.id);
        if (playlist) await this.playlistService.addTrack(playlist.id, track.id);
      } else {
        await this.spotifyService.removeFromLikedTracks(track.id);
        if (playlist) await this.playlistService.removeTrack(playlist.id, track.id);
      }
      this.snackBar.open(isLiked ? 'Added to Liked tracks' : 'Removed from Liked tracks', '', { duration: 2000 });
    } catch (error) {
      this.fail('Could not update your liked tracks.', error);
    }
  }

  private fail(message: string, error: unknown) {
    console.error(`[Player] ${message}`, error);
    this.snackBar.open(message, '', { duration: 4000 });
  }
}
