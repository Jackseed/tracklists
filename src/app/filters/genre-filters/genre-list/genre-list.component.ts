import { COMMA, ENTER } from '@angular/cdk/keycodes';
import { ChangeDetectionStrategy, Component, ElementRef, OnInit, ViewChild, inject } from '@angular/core';
import { FormControl } from '@angular/forms';
import { MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { MatChipInputEvent } from '@angular/material/chips';
import { combineLatest, Observable } from 'rxjs';
import { map, startWith } from 'rxjs/operators';
import { Genre, GenreQuery, GenreService } from '../+state';

@Component({
  selector: 'app-genre-list',
  templateUrl: './genre-list.component.html',
  styleUrls: ['./genre-list.component.css'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class GenreListComponent implements OnInit {
  private service = inject(GenreService);
  private query = inject(GenreQuery);

  genreControl = new FormControl<string | Genre | null>('');
  filteredGenres$: Observable<Genre[]>;
  activeGenres$: Observable<Genre[]>;
  separatorKeysCodes: number[] = [ENTER, COMMA];

  @ViewChild('genreInput') genreInput: ElementRef<HTMLInputElement>;

  ngOnInit(): void {
    this.activeGenres$ = this.query.selectActive() as Observable<Genre[]>;

    // Genres not selected yet, matching what is typed, most frequent first.
    this.filteredGenres$ = combineLatest([
      this.query.selectAll() as Observable<Genre[]>,
      this.activeGenres$,
      this.genreControl.valueChanges.pipe(startWith('')),
    ]).pipe(
      map(([genres, activeGenres, input]) => {
        const active = new Set(activeGenres.map((genre) => genre.id));
        const text = (typeof input === 'string' ? input : input?.id ?? '').toLowerCase();
        return genres
          .filter((genre) => !active.has(genre.id) && genre.id.toLowerCase().startsWith(text))
          .sort((a, b) => b.trackIds.length - a.trackIds.length);
      })
    );

  }

  add(event: MatChipInputEvent): void {
    const value = (event.value || '').trim();
    // Only genres of the selected playlists can be picked.
    if (value && this.query.hasEntity(value)) this.service.addActive(value);
    event.chipInput?.clear();
    this.genreControl.setValue('');
  }

  remove(genreId: string): void {
    this.service.removeActive(genreId);
    this.genreControl.setValue('');
  }

  selected(event: MatAutocompleteSelectedEvent): void {
    this.service.addActive(event.option.value.id);
    this.genreInput.nativeElement.value = '';
    this.genreControl.setValue('');
  }
}
