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

  public toggle(playlistId: string) {
    const genres$ = this.db
      .collection('playlists')
      .doc(playlistId)
      .collection('genres')
      .valueChanges()
      .pipe(
        tap((genres: Genre[]) =>
          genres.map((genre) => {
            // set genre in store if playlist active
            if (this.playlistQuery.hasActive(playlistId)) {
              this.store.upsert(genre.id, (entity) => ({
                id: genre.id,
                trackIds: entity.trackIds
                  ? entity.trackIds.concat(genre.trackIds)
                  : genre.trackIds,
              }));
              // else remove it
            } else {
              const stateGenre = this.query.getEntity(genre.id);
              if (!stateGenre) return;
              let filteredTrackIds: string[] = stateGenre.trackIds;
              // remove the tracks from the removed playlist
              for (const trackId of genre.trackIds) {
                filteredTrackIds = filteredTrackIds.filter(
                  (id) => id != trackId
                );
              }
              // if there are still tracks in the genre, update it, else remove it
              filteredTrackIds.length > 0
                ? this.store.update(genre.id, { trackIds: filteredTrackIds })
                : this.store.remove(genre.id);
            }
          })
        ),
        first()
      )
      .subscribe();
  }
}
