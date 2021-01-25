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
  id: string;
  activeTrackIds: string[];
  listed: boolean;
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
    this.createUIStore().setInitialEntityState((genre) => ({
      id: genre.id,
      activeTrackIds: [],
      listed: false,
    }));
    this.loadFromStorage();

  }

  // call storage instead of firebase
  public loadFromStorage() {
    const data = localStorage.getItem('genreStore');
    const uiData = localStorage.getItem('uiGenreStore');
    if (data) {
      // don't set store if empty
      if (!data.includes(':{}')) {
        this._setState((_) => JSON.parse(data));
        this.ui._setState((_) => JSON.parse(uiData));
        this.setActive([]);
        this.setLoading(false);
      }
    }
  }
}
