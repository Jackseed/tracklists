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
import { Genre, GenreQuery, GenreService } from '../+state';

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
    private service: GenreService,
    private query: GenreQuery,
    private trackService: TrackService
  ) {}

  ngOnInit(): void {
    this.genres$ = this.query.selectAll();

    this.activeGenres$ = this.query.selectActive();

    // genre list filtered by user search inputs
    this.filteredGenres$ = this.genreControl.valueChanges.pipe(
      startWith(''),
      switchMap((text) => (text ? this.textFilter(text) : this.genres$)),
      // remove the already selected genres from genre list
      map((genres) =>
        genres.filter((genre) => {
          const activeGenreIds = this.query.getActiveId();
          return !activeGenreIds.includes(genre.id);
        })
      ),
      map((genres) =>
        genres.sort((a, b) => b.trackIds.length - a.trackIds.length)
      )
    );

    // filter tracks depending on active genres
    this.activeGenres$
      .pipe(
        untilDestroyed(this),
        // remove genre filter on tracks when no genre
        tap((genres) =>
          genres.length === 0 ? this.trackService.removeFilter('genres') : false
        ),
        filter((genres) => genres.length > 0),
        map((genres) => genres.map((genre) => genre.trackIds)),
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
      this.service.addActive(value);
    }

    // Reset the input value
    if (input) {
      input.value = '';
    }

    this.genreControl.setValue(null);
  }

  remove(genreId: string): void {
    this.service.removeActive(genreId);
  }

  selected(event: MatAutocompleteSelectedEvent): void {
    this.service.addActive(event.option.value.id);
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
