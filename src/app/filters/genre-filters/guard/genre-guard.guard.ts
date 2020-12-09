import { Injectable } from '@angular/core';
import { CollectionGuard } from 'akita-ng-fire';
import { switchMap, tap } from 'rxjs/operators';
import { PlaylistQuery } from 'src/app/playlists/+state';
import { GenreService, GenreState, GenreStore } from '../+state';

@Injectable({
  providedIn: 'root',
})
export class GenreGuardGuard extends CollectionGuard<GenreState> {
  constructor(
    service: GenreService,
    private store: GenreStore,
    private playlistQuery: PlaylistQuery
  ) {
    super(service);
  }
  sync() {
    return this.playlistQuery.selectActiveId().pipe(
      tap((_) => this.store.reset()),
      switchMap((playlistId) =>
        this.service.syncCollection({ params: { playlistId } })
      )
    );
  }
}
