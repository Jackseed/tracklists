import { Component, Input, OnInit } from '@angular/core';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { Observable } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
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
  value = 0;
  constructor(private query: TrackQuery, private service: TrackService) {}

  ngOnInit(): void {
    window.setInterval((_) => {
      this.value += 1;
    }, 1000);
    this.track$
      .pipe(
        untilDestroyed(this),
        switchMap((track) => this.query.selectTrackPosition(track.id)),
        map((position) => {
          this.value = position / 1000;
        })
      )
      .subscribe();
  }

  public play(trackUri: string) {
    this.service.play([trackUri]);
  }
  public pause() {
    this.service.pause();
  }
  public playNext() {
    this.service.playNext();
  }
}
