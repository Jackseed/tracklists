import { Component, OnInit } from '@angular/core';
import { FormControl } from '@angular/forms';
import { Observable } from 'rxjs';
import { filter, map, startWith, switchMap } from 'rxjs/operators';
import { Genre, GenreQuery } from '../+state';

@Component({
  selector: 'app-genre-list',
  templateUrl: './genre-list.component.html',
  styleUrls: ['./genre-list.component.css'],
})
export class GenreListComponent implements OnInit {
  genreControl = new FormControl();
  genres$: Observable<Genre[]>;
  filteredGenres$: Observable<Genre[]>;

  constructor(private query: GenreQuery) {}

  ngOnInit(): void {
    this.genres$ = this.query.selectAll();
    this.filteredGenres$ = this.genreControl.valueChanges.pipe(
      startWith(''),
      switchMap((value) => this.textFilter(value))
    );
  }

  private textFilter(value: string): Observable<Genre[]> {
    const filterValue = value.toLowerCase();

    return this.genres$.pipe(
      map((genres) =>
        genres.filter(
          (genre) => genre.id.toLowerCase().indexOf(filterValue) === 0
        )
      )
    );
  }
}
