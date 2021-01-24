import { Injectable } from '@angular/core';
import { first, tap } from 'rxjs/operators';
import { PlaylistQuery } from 'src/app/playlists/+state';
import { GenreQuery } from './genre.query';
import { GenreStore } from './genre.store';

@Injectable({ providedIn: 'root' })
export class GenreService {
  constructor(
    private store: GenreStore,
    private query: GenreQuery,
    private playlistQuery: PlaylistQuery
  ) {}

  public setFirestoreGenres() {
    // if data can be loaded from localStorage, don't call firestore
    const data = localStorage.getItem('genreStore');
    // if storage data, loads it
    if (data && !data.includes(':{}')) {
      this.store.loadFromStorage();
    } else {
      const genres$ = this.query.selectUserGenres$;
      genres$
        .pipe(
          tap((genres) => {
            genres ? this.store.set(genres) : this.store.set({});
            this.store.setActive([]);
          }, first())
        )
        .subscribe();
    }
  }

  public addActive(genreIds: string[], playlistId: string) {
    this.store.addActive(genreIds);
    for (const genreId of genreIds) {
      this.updateUiTrackIds(genreId, playlistId);
    }
  }

  public addAllActive() {
    const genres = this.query.getAll();
    const genreIds = genres.map((genre) => genre.id);
    this.store.addActive(genreIds);

    const playlists = this.playlistQuery.getAll();
    const playlistIds = playlists.map((playlist) => playlist.id);

    for (const genre of genres) {
      let trackIds: string[] = [];

      for (const playlist in genre.playlists) {
        // filter other users' playslists
        if (playlistIds.includes(playlist)) {
          trackIds = trackIds.concat(genre.playlists[playlist]);
        }
      }

      const filteredTrackIds = trackIds.filter(
        (item, pos) => trackIds.indexOf(item) === pos
      );

      this.store.ui.replace(genre.id, {
        activeTrackIds: filteredTrackIds,
      });
    }
  }

  public removeActive(genreIds: string[], playlistId: string) {
    this.store.removeActive(genreIds);
    for (const genreId of genreIds) {
      this.removeUiTrackIds(genreId, playlistId);
    }
  }

  public removeAllActive() {
    this.store.setActive([]);
    this.store.ui.reset();
  }

  public updateUiTrackIds(genreId: string, playlistId: string) {
    const genre = this.query.getEntity(genreId);

    this.store.ui.upsert(genreId, {
      activeTrackIds: genre.playlists[playlistId],
    });
  }

  public removeUiTrackIds(genreId: string, playlistId: string) {
    const genre = this.query.getEntity(genreId);
    const activeTrackIds = this.query.ui.getEntity(genreId).activeTrackIds;

    this.store.ui.update(genreId, {
      activeTrackIds: activeTrackIds.filter(
        (trackId) => !genre.playlists[playlistId].includes(trackId)
      ),
    });
  }
}
