import { Injectable } from '@angular/core';
import { QueryEntity } from '@datorama/akita';
import { TrackStore, TrackState } from './track.store';
import { Observable, of } from 'rxjs';
import { debounceTime, map, switchMap } from 'rxjs/operators';
import { MinMax, Track } from './track.model';
import { AuthQuery } from '../../auth/+state';
import { PlaylistQuery } from '../../playlists/+state';
import { AkitaFiltersPlugin } from 'akita-filters-plugin';
import { LocalforageService } from '../../utils/localforage.service';
import {
  collection,
  collectionData,
  Firestore,
  query,
  where,
} from '@angular/fire/firestore';

@Injectable({ providedIn: 'root' })
export class TrackQuery extends QueryEntity<TrackState, Track> {
  trackFilters: AkitaFiltersPlugin<TrackState>;

  constructor(
    protected store: TrackStore,
    private authQuery: AuthQuery,
    private firestore: Firestore,
    private playlistQuery: PlaylistQuery,
    private localforage: LocalforageService
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
        this.localforage.setItem('trackStore', JSON.stringify(state));
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
      switchMap((userId) => {
        const trackCollection = collection(this.firestore, 'tracks');
        const userQuery = query(
          trackCollection,
          where('userIds', 'array-contains', userId)
        );
        return collectionData(userQuery) as Observable<Track[]>;
      })
    );
    return tracks$;
  }

  public get selectLikedTracks$(): Observable<Track[]> {
    const likedTracks$ = this.playlistQuery.likedTracksPlaylist.pipe(
      map((playlist) => playlist?.trackIds),
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

  public get getExtremeReleaseYears(): MinMax {
    let releaseYears = this.getAll().map((track) =>
      track.album.release_year ? track.album.release_year : null
    );
    releaseYears = releaseYears.filter((year) => year);

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
      max: Math.ceil(Math.max(...tempos.filter(Boolean))),
    };

    return extremes;
  }
}
