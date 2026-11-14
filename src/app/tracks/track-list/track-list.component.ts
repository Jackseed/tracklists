import { AfterViewInit, ChangeDetectionStrategy, Component, DestroyRef, ElementRef, NgZone, ViewChild, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BehaviorSubject, combineLatest, Observable } from 'rxjs';
import { map, shareReplay, switchMap } from 'rxjs/operators';
import { Track, TrackService } from '../+state';

/** The selected tracks, rendered a page at a time as the user scrolls. */
@Component({
  selector: 'app-track-list',
  templateUrl: './track-list.component.html',
  styleUrls: ['./track-list.component.css'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class TrackListComponent implements AfterViewInit {
  private service = inject(TrackService);
  private zone = inject(NgZone);
  private destroyRef = inject(DestroyRef);

  @ViewChild('anchor') anchor: ElementRef<HTMLElement>;
  private observer?: IntersectionObserver;
  private readonly page$ = new BehaviorSubject(1);

  public readonly tracks$: Observable<Track[]> = this.page$.pipe(
    switchMap((page) => this.service.getMore(page)),
    shareReplay({ bufferSize: 1, refCount: true })
  );
  public readonly hasMore$: Observable<boolean> = combineLatest([this.tracks$, this.service.tracksLength$]).pipe(
    map(([tracks, total]) => tracks.length < total)
  );

  ngAfterViewInit() {
    // Shows the next page when the end of the list comes into view.
    this.observer = new IntersectionObserver(
      // The callback runs outside Angular's zone: go back in, or the new rows would not be rendered.
      ([entry]) => entry.isIntersecting && this.zone.run(() => this.page$.next(this.page$.value + 1)),
      { rootMargin: '300px' }
    );
    this.observer.observe(this.anchor.nativeElement);
    this.destroyRef.onDestroy(() => this.observer?.disconnect());

    // The observer only reports changes: when a page does not fill the screen (tall
    // window, short rows) the end of the list stays in view and nothing would follow.
    // Observing again after each page makes it report the current situation.
    this.hasMore$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((hasMore) => {
      if (!hasMore) return;
      setTimeout(() => {
        this.observer?.unobserve(this.anchor.nativeElement);
        this.observer?.observe(this.anchor.nativeElement);
      });
    });
  }
}
