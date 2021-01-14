import { Injectable } from '@angular/core';
import { CollectionConfig, CollectionService } from 'akita-ng-fire';
import { first, tap } from 'rxjs/operators';
import { PlaylistQuery } from 'src/app/playlists/+state';
import { Genre } from './genre.model';
import { GenreQuery } from './genre.query';
import { GenreState, GenreStore } from './genre.store';

@Injectable({ providedIn: 'root' })
@CollectionConfig({ path: 'playlists/:playlistId' })
export class GenreService extends CollectionService<GenreState> {
  constructor(
    store: GenreStore,
    private query: GenreQuery,
    private playlistQuery: PlaylistQuery
  ) {
    super(store);
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
            for (const trackId of genre.trackIds) {
              filteredTrackIds = filteredTrackIds.filter((id) => id != trackId);
            }
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
