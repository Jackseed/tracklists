import { Component, Input, OnInit } from '@angular/core';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { Observable } from 'rxjs';
import { filter, map, switchMap, tap } from 'rxjs/operators';
import { SpotifyService } from '../spotify/spotify.service';
import { Track } from '../tracks/+state';
import { PlayerQuery } from './+state';

@UntilDestroy()
@Component({
  selector: 'app-player',
  templateUrl: './player.component.html',
  styleUrls: ['./player.component.css'],
})
export class PlayerComponent implements OnInit {
  @Input() track$: Observable<Track>;
  position$: Observable<number>;
  paused$: Observable<boolean>;
  value = 0;
  isTicking = false;

  constructor(
    private query: PlayerQuery,
    private spotifyService: SpotifyService
  ) {}

  ngOnInit(): void {
    let interval;
    // get track position
    this.track$
      .pipe(
        untilDestroyed(this),
        filter((track) => !!track),
        switchMap((track) => this.query.selectPosition(track.id)),
        map((position) => {
          this.value = position / 1000;
        })
      )
      .subscribe();
    this.paused$ = this.track$.pipe(
      filter((track) => !!track),
      switchMap((track) => this.query.selectPaused(track.id))
    );
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
              this.value += 1;
              this.isTicking = true;
            }, 1000);
          }
        })
      )
      .subscribe();
    const elements = document.getElementsByClassName('mat-slider-thumb');
    while (elements.length > 0) {
      elements[0].parentNode.removeChild(elements[0]);
    }
  }

  // TODO pause when space bar

  public async play() {
    await this.spotifyService.play();
  }
  public async pause() {
    await this.spotifyService.pause();
  }
  public async playNext() {
    await this.spotifyService.playNext();
  }

  public async onChangeSlider() {
    await this.spotifyService.seekPosition(this.value * 1000);
  }
}
