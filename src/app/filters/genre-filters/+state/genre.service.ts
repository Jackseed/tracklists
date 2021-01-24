import { Injectable } from '@angular/core';
import { first, tap } from 'rxjs/operators';
import { PlaylistQuery } from 'src/app/playlists/+state';
import { Genre } from './genre.model';
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

  public addActive(genreId: string) {
    this.store.addActive(genreId);
  }

  public removeActive(genreId: string) {
    this.store.removeActive(genreId);
  }

  public toggleActive(genreId: string) {
    this.store.toggleActive(genreId);
  }

  // add genres to the store
  public addPlaylistGenres(playlistId: string) {
    this.db
      .collection('playlists')
      .doc(playlistId)
      .collection('genres')
      .valueChanges()
      .pipe(
        tap((genres: Genre[]) =>
          genres.map((genre) => {
            this.store.upsert(genre.id, (entity) => ({
              id: genre.id,
              // if the genre already exists in the store, add the tracks of that genre
              // otherwise, add its tracks
              trackIds: entity.trackIds
                ? entity.trackIds.concat(genre.trackIds)
                : genre.trackIds,
            }));
          })
        ),
        first()
      )
      .subscribe();
  }
  // remove genres to the store
  public removePlaylistGenres(playlistId: string) {
    this.db
      .collection('playlists')
      .doc(playlistId)
      .collection('genres')
      .valueChanges()
      .pipe(
        tap((genres: Genre[]) =>
          genres.map((genre) => {
            const existingGenre = this.query.getEntity(genre.id);
            if (!existingGenre) return;
            let filteredTrackIds: string[] = existingGenre.trackIds;
            // remove the tracks from the removed playlist
            filteredTrackIds = filteredTrackIds.filter(
              (id) => !genre.trackIds.includes(id)
            );
            // if there are still tracks in the genre, update it, else remove it
            filteredTrackIds.length > 0
              ? this.store.update(genre.id, { trackIds: filteredTrackIds })
              : this.store.remove(genre.id);
          })
        ),

        first()
      )
      .subscribe();
  }

  public toggle(playlistId: string) {
    this.playlistQuery.hasActive(playlistId)
      ? this.addPlaylistGenres(playlistId)
      : this.removePlaylistGenres(playlistId);
  }
}
