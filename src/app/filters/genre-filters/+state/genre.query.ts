import { Injectable } from '@angular/core';
import { QueryEntity } from '@datorama/akita';
import { GenreState, GenreStore } from './genre.store';

@Injectable({ providedIn: 'root' })
export class GenreQuery extends QueryEntity<GenreState> {
  constructor(protected override store: GenreStore) {
    super(store);
  }
}
