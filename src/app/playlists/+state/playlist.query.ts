import { Injectable } from '@angular/core';
import { QueryEntity } from '@datorama/akita';
import { Observable } from 'rxjs';
import { distinctUntilChanged, map, shareReplay } from 'rxjs/operators';
import { Playlist } from './playlist.model';
import { PlaylistState, PlaylistStore } from './playlist.store';

@Injectable({ providedIn: 'root' })
export class PlaylistQuery extends QueryEntity<PlaylistState> {
  /** The synthetic playlist holding the user's liked tracks. */
  public readonly likedTracksPlaylist: Observable<Playlist | undefined> = this.selectAll({
    filterBy: (playlist) => playlist.type === 'likedTracks',
    limitTo: 1,
  }).pipe(map((playlists) => playlists[0]));

  /** Ids of the liked tracks, as a Set shared by every track row. */
  public readonly likedTrackIds$: Observable<Set<string>> = this.likedTracksPlaylist.pipe(
    map((playlist) => playlist?.trackIds),
    distinctUntilChanged(),
    map((trackIds) => new Set(trackIds ?? [])),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  constructor(protected override store: PlaylistStore) {
    super(store);
  }
}
