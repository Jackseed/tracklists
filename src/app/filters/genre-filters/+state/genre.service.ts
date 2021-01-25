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
          }),
          first()
        )
        .subscribe();
    }
  }

  public addActive(genreIds: string[], playlistId: string) {
    const start = Date.now();
    this.store.addActive(genreIds);
/*     for (const genreId of genreIds) {
      this.updateUiTrackIds(genreId, playlistId);
    } */
    const millis = Date.now() - start;
    console.log(`seconds elapsed = ${millis}ms`);
  }

  public updateUiTrackIds(genreId: string, playlistId: string) {
    const genre = this.query.getEntity(genreId);
    const genreUi = this.query.ui.getEntity(genreId);
    let activeTrackIds = genre.playlists[playlistId];
    console.log('here');
    // if already a genre, concat and remove duplicates
    if (genreUi) {
      const trackIds = genreUi.activeTrackIds.concat(
        genre.playlists[playlistId]
      );

      activeTrackIds = trackIds.filter(
        (item, pos) => trackIds.indexOf(item) === pos
      );
    }

    this.store.ui.update(genreId, {
      activeTrackIds,
    });
  }

  public addAllActive() {
    const start = Date.now();
    const genres = this.query.getAll();
    const genreIds = genres.map((genre) => genre.id);
    this.store.setActive(genreIds);
    const mid = Date.now() - start;

    console.log(`seconds elapsed for all active = ${mid}ms`);

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
      // remove duplicates
      const filteredTrackIds = trackIds.filter(
        (item, pos) => trackIds.indexOf(item) === pos
      );

      this.store.ui.update(genre.id, {
        id: genre.id,
        activeTrackIds: filteredTrackIds,
        listed: false,
      });
    }
    const millis = Date.now() - start;

    console.log(`seconds elapsed = ${millis}ms`);
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

  public removeUiTrackIds(genreId: string, playlistId: string) {
    const genre = this.query.getEntity(genreId);

    const activeTrackIds = this.query.ui.getEntity(genreId).activeTrackIds;

    this.store.ui.update(genreId, {
      activeTrackIds: activeTrackIds.filter(
        (trackId) => !genre.playlists[playlistId].includes(trackId)
      ),
    });
  }

  public list(genreId: string) {
    this.store.ui.update(genreId, {
      listed: true,
    });
  }

  public unlist(genreId: string) {
    this.store.ui.update(genreId, {
      listed: false,
    });
  }
}
