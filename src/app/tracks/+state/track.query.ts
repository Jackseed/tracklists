import { Injectable } from '@angular/core';
import { QueryEntity } from '@datorama/akita';
import { TrackStore, TrackState } from './track.store';
import { Observable, of } from 'rxjs';
import { debounceTime, map, switchMap } from 'rxjs/operators';
import { MinMax, Track } from './track.model';
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

  public get getExtremeReleaseYears(): MinMax {
    const releaseYears = this.getAll().map((track) => track.album.release_year);

    const extremes = {
      min: Math.min(...releaseYears),
      max: Math.max(...releaseYears),
    };

    return extremes;
  }

  public get getExtremeTempos(): MinMax {
    const tempos = this.getAll().map((track) => track.tempo);

    const extremes = {
      // remove 0
      min: Math.floor(Math.min(...tempos.filter(Boolean))),
      max: Math.ceil(Math.max(...tempos)),
    };

    return extremes;
  }
}
