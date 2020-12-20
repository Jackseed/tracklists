import { COMMA, ENTER } from '@angular/cdk/keycodes';
import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { FormControl } from '@angular/forms';
import {
  MatAutocomplete,
  MatAutocompleteSelectedEvent,
} from '@angular/material/autocomplete';
import { MatChipInputEvent } from '@angular/material/chips';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { Observable } from 'rxjs';
import { filter, map, startWith, switchMap, tap } from 'rxjs/operators';
import { TrackService } from 'src/app/tracks/+state';
import { Genre, GenreQuery, GenreStore } from '../+state';

@UntilDestroy()
@Component({
  selector: 'app-genre-list',
  templateUrl: './genre-list.component.html',
  styleUrls: ['./genre-list.component.css'],
})
export class GenreListComponent implements OnInit {
  genreControl = new FormControl();
  genres$: Observable<Genre[]>;
  filteredGenres$: Observable<Genre[]>;
  activeGenres$: Observable<Genre[]>;
  listedGenres$: Observable<Genre[]>;
  selectable = true;
  removable = true;
  separatorKeysCodes: number[] = [ENTER, COMMA];

  @ViewChild('genreInput') genreInput: ElementRef<HTMLInputElement>;
  @ViewChild('auto') matAutocomplete: MatAutocomplete;

  constructor(
    private store: GenreStore,
    private query: GenreQuery,
    private trackService: TrackService
  ) {}

  ngOnInit(): void {
    this.genres$ = this.query.selectAll();
    this.activeGenres$ = this.query.selectActive();
    this.filteredGenres$ = this.genreControl.valueChanges.pipe(
      startWith(''),
      switchMap((text) => (text ? this.textFilter(text) : this.genres$)),
      // filter the already selected genres
      map((genres) =>
        genres.filter((genre) => {
          const activeGenreIds = this.query.getActiveId();
          return !activeGenreIds.includes(genre.id);
        })
      )
    );

    this.activeGenres$
      .pipe(
        untilDestroyed(this),
        tap((genres) =>
          genres.length === 0 ? this.trackService.removeFilter('genres') : false
        ),
        filter((genres) => genres.length > 0),
        map((genres) => genres.map((genre) => genre.trackIds)),
        // @ts-ignore: Unreachable code error
        map((arrTrackIds) => arrTrackIds.flat()),
        tap((trackIds) =>
          this.trackService.setFilter({
            id: 'genres',
            predicate: (track) => trackIds.includes(track.id),
          })
        )
      )
      .subscribe();
  }

  add(event: MatChipInputEvent): void {
    const input = event.input;
    const value = event.value;

    // Set selected genre active
    if ((value || '').trim()) {
      this.store.addActive(value);
    }

    // Reset the input value
    if (input) {
      input.value = '';
    }

    this.genreControl.setValue(null);
  }

  remove(genreId: string): void {
    this.store.removeActive(genreId);
  }

  selected(event: MatAutocompleteSelectedEvent): void {
    this.store.addActive(event.option.value.id);
    this.genreInput.nativeElement.value = '';
    this.genreControl.setValue(null);
  }

  private textFilter(value: string | Genre): Observable<Genre[]> {
    let filterValue;
    if (typeof value === 'string') {
      filterValue = value.toLowerCase();
    } else {
      filterValue = value.id;
    }
    return this.genres$.pipe(
      map((genres) =>
        genres.filter(
          (genre) => genre.id.toLowerCase().indexOf(filterValue) === 0
        )
      )
    );
  }
}
