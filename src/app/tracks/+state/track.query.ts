import { Injectable } from '@angular/core';
import { QueryEntity } from '@datorama/akita';
import { TrackStore, TrackState } from './track.store';
import { Observable, of } from 'rxjs';
import { debounceTime, filter, map, switchMap } from 'rxjs/operators';
import { Track } from './track.model';
import { AuthQuery } from 'src/app/auth/+state';
import { AngularFirestore } from '@angular/fire/firestore';
import { PlaylistQuery } from 'src/app/playlists/+state';
import { AkitaFiltersPlugin } from 'akita-filters-plugin';

@Injectable({ providedIn: 'root' })
export class TrackQuery extends QueryEntity<TrackState, Track> {
  trackFilters: AkitaFiltersPlugin<TrackState>;

  constructor(
    protected store: TrackStore,
    private authQuery: AuthQuery,
    private afs: AngularFirestore,
    private playlistQuery: PlaylistQuery
  ) {
    super(store);
    this.saveToStorage();
    this.trackFilters = new AkitaFiltersPlugin<TrackState>(this);
  }
  // save to storage to avoid calling firebase
  saveToStorage() {
    this.select()
      .pipe(debounceTime(2000))
      .subscribe((state) => {
        localStorage.setItem('trackStore', JSON.stringify(state));
      });
  }

  selectFilteredTracks(): Observable<Track[]> {
    const activeIds$ = this.selectActiveId();

    const tracks$ = activeIds$.pipe(
      filter((ids) => !!ids),
      switchMap((ids) =>
        this.trackFilters.selectAllByFilters({
          // limit filtered selection to active tracks
          filterBy: (track) => ids.includes(track.id),
        })
      )
    );
    // @ts-ignore zs it was not an hashMap with not asObject
    return tracks$;
  }

  public getMore(page: number): Observable<Track[]> {
    const activeIds$ = this.selectActiveId();
    const perPage = 15;
    const offset = page * perPage;

    return activeIds$
      .pipe(
        switchMap((ids) =>
          this.trackFilters.selectAllByFilters({
            // limit selection to active tracks
            filterBy: (track) => ids.includes(track.id),
          })
        )
      )
      .pipe(map((tracks: Track[]) => tracks.slice(0, offset)));
  }

  public get tracksLength$() {
    return this.selectFilteredTracks().pipe(
      map((tracks) => {
        return tracks.length;
      })
    );
  }

  selectGenres(): Observable<string[][]> {
    return this.selectAll().pipe(
      map((tracks) => tracks.map((track) => track.genres))
    );
  }

  public get selectUserTracks$(): Observable<Track[]> {
    const userId$ = this.authQuery.selectActiveId();
    const tracks$ = userId$.pipe(
      switchMap(
        (userId) =>
          this.afs
            .collection('tracks', (ref) =>
              ref.where('userIds', 'array-contains', userId)
            )
            .valueChanges() as Observable<Track[]>
      )
    );
    return tracks$;
  }

  public get selectLikedTracks$(): Observable<Track[]> {
    const likedTracks$ = this.playlistQuery.likedTracksPlaylist.pipe(
      map((playlist) => playlist.trackIds),
      switchMap((trackIds) => this.selectMany(trackIds))
    );
    return likedTracks$;
  }

  public isLiked$(trackId: string): Observable<boolean> {
    return this.selectLikedTracks$.pipe(
      map((tracks) => tracks.map((track) => track.id)),
      switchMap((trackIds) => of(trackIds.includes(trackId)))
    );
  }

  public selectSpinner(): Observable<boolean> {
    return this.select((state) => state.ui.spinner);
  }

  public selectLoadingItem(): Observable<string> {
    return this.select((state) => state.ui.loadingItem);
  }

  public selectReleaseYears(): Observable<number[]> {
    return this.selectFilteredTracks().pipe(
      map((tracks) =>
        tracks.map((track) => parseFloat(track.album.release_date.slice(0, 4)))
      )
    );
  }

  public selectTempo(): Observable<number[]> {
    return this.selectFilteredTracks().pipe(
      map((tracks) => tracks.map((track) => track.tempo))
    );
  }
}
