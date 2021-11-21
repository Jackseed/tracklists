import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { combineLatest, Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Track, TrackService } from '../+state';

@Component({
  selector: 'app-track-list',
  templateUrl: './track-list.component.html',
  styleUrls: ['./track-list.component.css'],
})
export class TrackListComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('anchor') anchor: ElementRef<HTMLElement>;
  private observer: IntersectionObserver;
  public tracks$: Observable<Track[]>;
  public trackNumber$: Observable<number>;
  public page: number = 0;
  public hasMore$: Observable<boolean>;

  constructor(private service: TrackService) {}

  ngOnInit(): void {
    this.tracks$ = this.service.getMore(this.page);

    this.observer = new IntersectionObserver(([entry]) => {
      entry.isIntersecting && this.onScroll();
    });

    this.trackNumber$ = this.service.tracksLength$;

    this.hasMore$ = combineLatest([this.tracks$, this.trackNumber$]).pipe(
      map(([tracks, total]) => (tracks?.length === total ? false : true))
    );
  }

  ngAfterViewInit() {
    this.observer.observe(this.anchor.nativeElement);
  }

  public onScroll() {
    this.page++;
    this.tracks$ = this.service.getMore(this.page);
    this.hasMore$ = combineLatest([this.tracks$, this.trackNumber$]).pipe(
      map(([tracks, total]) => (tracks?.length === total ? false : true))
    );
  }

  ngOnDestroy() {
    this.observer.disconnect();
  }
}
