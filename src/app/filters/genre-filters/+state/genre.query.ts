import { Injectable } from '@angular/core';
import { QueryEntity } from '@datorama/akita';
import { Genre } from './genre.model';
import { GenreState, GenreStore } from './genre.store';

@Injectable({ providedIn: 'root' })
export class GenreQuery extends QueryEntity<GenreState> {
  constructor(protected store: GenreStore) {
    super(store);
  }

  public get topGenres(): Genre[] {
    return this.getAll({
      sortBy: (a, b) => b.trackIds.length - a.trackIds.length,
      limitTo: 4,
    });
  }
}
