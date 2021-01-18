import { Component, Input, OnInit } from '@angular/core';
import { MatIconRegistry } from '@angular/material/icon';
import { DomSanitizer } from '@angular/platform-browser';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { Observable } from 'rxjs';
import { filter, first, map, switchMap, tap } from 'rxjs/operators';
import { SpotifyService } from '../spotify/spotify.service';
import { Track } from '../tracks/+state';
import { PlayerQuery, PlayerService } from './+state';

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
  value = 0;
  isTicking = false;

  constructor(
    private query: PlayerQuery,
    private service: PlayerService,
    private spotifyService: SpotifyService,
    private matIconRegistry: MatIconRegistry,
    private domSanitizer: DomSanitizer
  ) {}

  ngOnInit(): void {
    this.matIconRegistry.addSvgIcon(
      'shuffle',
      this.domSanitizer.bypassSecurityTrustResourceUrl(
        `../../assets/shuffle.svg`
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
    this.shuffle$.subscribe(console.log);
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
  }

  // TODO pause when space bar

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
    await this.spotifyService.seekPosition(this.value * 1000);
  }

  public shuffle() {
    this.shuffle$
      .pipe(
        tap((shuffle) => this.service.updateShuffle(!shuffle)),
        first()
      )
      .subscribe(console.log);
  }
}
