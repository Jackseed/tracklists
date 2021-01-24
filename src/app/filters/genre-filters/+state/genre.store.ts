import { Injectable } from '@angular/core';
import {
  EntityState,
  EntityStore,
  EntityUIStore,
  MultiActiveState,
  StoreConfig,
} from '@datorama/akita';
import { Genre } from './genre.model';

export type GenreUI = {
  activeTrackIds: string[];
};

export interface GenreState
  extends EntityState<Genre, string>,
    MultiActiveState {}
export interface GenresUIState extends EntityState<GenreUI> {}

const initialState = {
  active: [],
};

@Injectable({ providedIn: 'root' })
@StoreConfig({ name: 'genres' })
export class GenreStore extends EntityStore<GenreState> {
  ui: EntityUIStore<GenresUIState>;

  constructor() {
    super(initialState);
    this.loadFromStorage();
    this.createUIStore().setInitialEntityState({ activeTrackIds: [] });
  }

  // call storage instead of firebase
  public loadFromStorage() {
    const data = localStorage.getItem('genreStore');
    if (data) {
      // don't set store if empty
      if (!data.includes(':{}')) {
        this._setState((_) => JSON.parse(data));
        this.setActive([]);
        this.setLoading(false);
      }
    }
  }
}
