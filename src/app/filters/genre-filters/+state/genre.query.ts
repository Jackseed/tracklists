import { Injectable } from '@angular/core';
import { AngularFirestore } from '@angular/fire/firestore';
import { QueryEntity, EntityUIQuery } from '@datorama/akita';
import { Observable } from 'rxjs';
import { debounceTime, first, switchMap } from 'rxjs/operators';
import { AuthQuery } from 'src/app/auth/+state';
import { Track } from 'src/app/tracks/+state';
import { Genre } from './genre.model';
import { GenreState, GenreStore, GenresUIState, GenreUI } from './genre.store';

@Injectable({ providedIn: 'root' })
export class GenreQuery extends QueryEntity<GenreState> {
  ui: EntityUIQuery<GenresUIState>;

  constructor(
    protected store: GenreStore,
    private authQuery: AuthQuery,
    private afs: AngularFirestore
  ) {
    super(store);
    this.createUIQuery();
    this.saveToStorage();
  }
  // TODO Unsubscribe
  // save to storage to avoid calling firebase
  saveToStorage() {
    this.select()
      .pipe(debounceTime(2000),)
      .subscribe((state) => {
        localStorage.setItem('genreStore', JSON.stringify(state));
      });
    this.ui
      .select()
      .pipe(debounceTime(2000))
      .subscribe((state) => {
        localStorage.setItem('uiGenreStore', JSON.stringify(state));
      });
  }

  public get selectUserGenres$(): Observable<Genre[]> {
    const userId$ = this.authQuery.selectActiveId();
    const genres$ = userId$.pipe(
      switchMap(
        (userId) =>
          this.afs
            .collection('genres', (ref) =>
              ref.where('userIds', 'array-contains', userId)
            )
            .valueChanges() as Observable<Genre[]>
      )
    );
    return genres$;
  }

  public get selectUIGenres$(): Observable<GenreUI[]> {
    return this.ui.selectAll();
  }

  public get selectListedGenres$(): Observable<GenreUI[]> {
    return this.ui.selectAll({
      filterBy: (genre) => genre.listed,
    });
  }

  public get listedGenreIds(): string[] {
    return this.ui
      .getAll({
        filterBy: (genre) => genre.listed,
      })
      .map((genre) => genre.id);
  }
}
