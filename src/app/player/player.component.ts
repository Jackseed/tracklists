import { Component, Input, OnInit } from '@angular/core';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { Observable } from 'rxjs';
import { map, switchMap, tap } from 'rxjs/operators';
import { TrackService, Track, TrackQuery } from '../tracks/+state';

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

  constructor(private query: TrackQuery, private service: TrackService) {}

  ngOnInit(): void {
    let interval;
    // get track position
    this.track$
      .pipe(
        untilDestroyed(this),
        switchMap((track) => this.query.selectPosition(track.id)),
        map((position) => {
          this.value = position / 1000;
        })
      )
      .subscribe();
    this.paused$ = this.track$.pipe(
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

  public play() {
    this.service.play();
  }
  public pause() {
    this.service.pause();
  }
  public playNext() {
    this.service.playNext();
  }
  public onChangeSlider() {
    this.service.seekPosition(this.value * 1000);
  }
}
