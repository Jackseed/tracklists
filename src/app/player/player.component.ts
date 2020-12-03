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
  constructor(private query: TrackQuery, private service: TrackService) {}

  ngOnInit(): void {
    let interval;
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
    this.paused$
      .pipe(
        untilDestroyed(this),
        tap((paused) =>
          paused
            ? clearInterval(interval)
            : (interval = window.setInterval((_) => {
                this.value += 1;
              }, 1000))
        )
      )
      .subscribe(console.log);
  }

  public play() {
    this.service.play();
  }
  public pause() {
    this.service.pause();
  }
  public playNext() {
    this.service.playNext();
  }
}
