import { Injectable } from '@angular/core';
import {
  EntityState,
  EntityStore,
  MultiActiveState,
  StoreConfig,
} from '@datorama/akita';
import { Genre } from './genre.model';

export interface GenreState
  extends EntityState<Genre, string>,
    MultiActiveState {}
const initialState = {
  active: [],
};
@Injectable({ providedIn: 'root' })
@StoreConfig({ name: 'genres' })
export class GenreStore extends EntityStore<GenreState> {
  constructor() {
    super(initialState);
  }
}
