import { Injectable } from '@angular/core';
import { CollectionConfig, CollectionService } from 'akita-ng-fire';
import { collection, collectionData, Firestore } from '@angular/fire/firestore';
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
    private playlistQuery: PlaylistQuery,
    private firestore: Firestore
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

  // Adds genres to the store.
  public addPlaylistGenres(playlistId: string) {
    const genreCollection = collection(
      this.firestore,
      `playlists/${playlistId}/genres`
    );
    collectionData(genreCollection)
      .pipe(
        tap((genres: Genre[]) =>
          genres.map((newGenre) => {
            this.store.upsert(newGenre.id, (existingGenre: Genre) => ({
              id: newGenre.id,
              // if the genre already exists in the store, add the new unique tracks to that genre
              // otherwise, add its tracks only
              trackIds: existingGenre.trackIds
                ? existingGenre.trackIds.concat(
                    newGenre.trackIds.filter(
                      (trackId) => !existingGenre.trackIds.includes(trackId)
                    )
                  )
                : newGenre.trackIds,
            }));
          })
        ),
        first()
      )
      .subscribe();
  }
  // Removes genres from the store.
  public removePlaylistGenres(playlistId: string) {
    const genreCollection = collection(
      this.firestore,
      `playlists/${playlistId}/genres`
    );
    collectionData(genreCollection)
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
