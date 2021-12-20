import { Component, Input, OnInit } from '@angular/core';
import { MatIconRegistry } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { DomSanitizer } from '@angular/platform-browser';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { combineLatest, Observable } from 'rxjs';
import { filter, first, map, switchMap, tap } from 'rxjs/operators';
import { PlaylistQuery, PlaylistService } from '../playlists/+state';
import { SpotifyService } from '../spotify/spotify.service';
import { Track, TrackQuery } from '../tracks/+state';
import { PlayerQuery } from './+state';

@UntilDestroy()
@Component({
  selector: 'app-player',
  templateUrl: './player.component.html',
  styleUrls: ['./player.component.css'],
})
export class PlayerComponent implements OnInit {
  @Input() track$: Observable<Track>;
  paused$: Observable<boolean>;
  shuffle$: Observable<boolean>;
  isLiked$: Observable<boolean>;
  value = 0;
  isTicking = false;

  constructor(
    private query: PlayerQuery,
    private trackQuery: TrackQuery,
    private playlistQuery: PlaylistQuery,
    private playlistService: PlaylistService,
    private spotifyService: SpotifyService,
    private matIconRegistry: MatIconRegistry,
    private domSanitizer: DomSanitizer,
    private _snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.isLiked$ = this.track$.pipe(
      switchMap((track) => this.trackQuery.isLiked$(track.id))
    );
    this.matIconRegistry.addSvgIcon(
      'shuffle',
      this.domSanitizer.bypassSecurityTrustResourceUrl(
        `../assets/buttons/shuffle.svg`
      )
    );
    let interval;
    // get track position
    this.track$
      .pipe(
        untilDestroyed(this),
        filter((track) => !!track),
        switchMap((track) => this.query.selectPosition(track.id)),
        map((position) => {
          clearInterval(interval);
          this.isTicking = false;
          return (this.value = position / 1000);
        })
      )
      .subscribe();
    this.paused$ = this.track$.pipe(
      filter((track) => !!track),
      switchMap((track) => this.query.selectPaused(track.id))
    );

    this.shuffle$ = this.query.selectShuffle();

    // if the track is played, add 1 to value every sec
    this.paused$
      .pipe(
        untilDestroyed(this),
        tap((paused) => {
          if (paused) {
            clearInterval(interval);
            this.isTicking = false;
          }
        }),
        tap((paused) => {
          if (!paused && !this.isTicking) {
            interval = window.setInterval((_) => {
              const activeTrack = this.query.getActive();
              if (this.value <= activeTrack.duration_ms / 1000) {
                this.value += 1;
                this.isTicking = true;
              }
            }, 1000);
          }
        })
      )
      .subscribe();
  }

  public async play() {
    await this.spotifyService.play();
  }
  public async pause() {
    await this.spotifyService.pause();
  }
  public async previous() {
    await this.spotifyService.previous();
  }
  public async next() {
    await this.spotifyService.next();
  }

  public async onChangeSlider() {
    await this.spotifyService.seekPosition(Math.round(this.value * 1000));
  }

  public async shuffle() {
    const state = this.query.getShuffle();
    await this.spotifyService.shuffle(!state);
  }

  /* TODO: Add this in track service */
  public async like() {
    const likedTracksPlaylist$ = this.playlistQuery.likedTracksPlaylist;
    combineLatest([likedTracksPlaylist$, this.track$])
      .pipe(
        tap(async ([playlist, track]) => {
          this.playlistService.addTrack(playlist.id, track.id);
          await this.spotifyService.addToLikedTracks(track.id);
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
    combineLatest([likedTracksPlaylist$, this.track$])
      .pipe(
        tap(async ([playlist, track]) => {
          this.playlistService.removeTrack(playlist.id, track.id);
          await this.spotifyService.removeFromLikedTracks(track.id);
          this._snackBar.open('Removed from Liked tracks', '', {
            duration: 2000,
          });
        }),
        first()
      )
      .subscribe();
  }
}
