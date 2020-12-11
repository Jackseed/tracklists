import { Injectable } from '@angular/core';
import { CollectionConfig, CollectionService } from 'akita-ng-fire';
import { first, tap } from 'rxjs/operators';
import { PlaylistQuery } from 'src/app/playlists/+state';
import { TrackService } from 'src/app/tracks/+state';
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
    private trackService: TrackService
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
              let filteredTrackIds: string[] = stateGenre.trackIds;
              for (const trackId of genre.trackIds) {
                filteredTrackIds = filteredTrackIds.filter(
                  (id) => id != trackId
                );
              }
              this.store.update(genre.id, { trackIds: filteredTrackIds });
            }
          })
        ),
        first()
      )
      .subscribe();
  }
}
