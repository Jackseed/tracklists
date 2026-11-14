import { Injectable, inject } from '@angular/core';
import { applyTransaction } from '@datorama/akita';
import { AkitaFilter, AkitaFiltersPlugin } from 'akita-filters-plugin';
import { Observable } from 'rxjs';
import { map, shareReplay, switchMap } from 'rxjs/operators';
import { AuthQuery } from '../../auth/+state/auth.query';
import { LocalforageService } from '../../utils/localforage.service';
import { Track } from './track.model';
import { TrackQuery } from './track.query';
import { TrackRepository } from './track.repository';
import { TrackState, TrackStore } from './track.store';

/** The library as cached in the browser (IndexedDB) between visits. */
interface LibraryCache {
  version: 2;
  uid: string;
  /** `users/{uid}.libraryUpdatedAt` (ms) when the tracks were read: tells if the cache is still current. */
  libraryUpdatedAt: number | null;
  tracks: Track[];
}

const CACHE_KEY = 'library';
/** Keys of the previous cache format (the whole store serialised as JSON). */
const LEGACY_CACHE_KEYS = ['trackStore', 'playlistStore'];
const TRACKS_PER_SCROLL = 15;

@Injectable({ providedIn: 'root' })
export class TrackService {
  private store = inject(TrackStore);
  private query = inject(TrackQuery);
  private authQuery = inject(AuthQuery);
  private repository = inject(TrackRepository);
  private localforage = inject(LocalforageService);

  private trackFilters = new AkitaFiltersPlugin<TrackState>(this.query);
  private currentLoad = 0;
  private legacyCacheCleared = false;

  /** Selected tracks (active playlists) that pass the filters; computed once for all subscribers. */
  private readonly filteredTracks$: Observable<Track[]> = this.query.selectActiveId().pipe(
    map((ids) => new Set((ids ?? []) as string[])),
    switchMap((ids) => this.trackFilters.selectAllByFilters({ filterBy: (track: Track) => ids.has(track.id) }) as Observable<Track[]>),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  //--------------------------------
  //        LIBRARY LOADING       //
  //--------------------------------
  /**
   * Puts the user's tracks in the store.
   *
   * The browser cache is used when it matches the version of the library
   * stored on the user document: no Firestore read at all in that case.
   * Otherwise tracks are read from Firestore page by page, behind the cached
   * ones if there are any.
   */
  public async loadLibrary(): Promise<void> {
    const user = this.authQuery.getActive();
    if (!user) return;
    const load = ++this.currentLoad;
    const superseded = () => load !== this.currentLoad;
    const version = user.libraryUpdatedAt?.toMillis() ?? null;
    this.clearLegacyCache();

    // Only look at the cache when nothing is displayed yet (first load of this visit).
    const cached = this.query.getCount() === 0 ? await this.readCache(user.uid) : null;
    if (superseded()) return;
    if (cached) {
      applyTransaction(() => {
        this.store.set(cached.tracks);
        this.store.setActive([]);
        this.store.update({ ui: { loading: false, loaded: cached.tracks.length, error: null } });
      });
      if (version !== null && cached.libraryUpdatedAt === version) return;
    }

    // With cached tracks on screen the refresh is silent; otherwise the loading screen shows the count.
    const silent = cached !== null;
    if (!silent) this.store.update({ ui: { loading: true, loaded: 0, error: null } });
    try {
      const tracks = await this.repository.fetchUserTracks(user.uid, (loaded) => {
        if (!silent && !superseded()) this.store.update({ ui: { loading: true, loaded, error: null } });
      });
      if (superseded()) return;
      applyTransaction(() => {
        this.store.set(tracks);
        if (!silent) this.store.setActive([]);
        this.store.update({ ui: { loading: false, loaded: tracks.length, error: null } });
      });
      await this.writeCache({ version: 2, uid: user.uid, libraryUpdatedAt: version, tracks });
    } catch (error) {
      console.error('[TrackService] could not load the library from Firestore:', error);
      if (superseded() || silent) return;
      this.store.update({ ui: { loading: false, loaded: 0, error: 'Your tracks could not be loaded. Check your connection and try again.' } });
    }
  }

  private async readCache(uid: string): Promise<LibraryCache | null> {
    try {
      const cache = await this.localforage.getItem<LibraryCache>(CACHE_KEY);
      const valid = cache?.version === 2 && cache.uid === uid && Array.isArray(cache.tracks) && cache.tracks.length > 0;
      return valid ? cache : null;
    } catch (error) {
      console.warn('[TrackService] unreadable library cache:', error);
      return null;
    }
  }

  private async writeCache(cache: LibraryCache): Promise<void> {
    try {
      // An empty library is not cached: it is cheap to check again, and worth double-checking.
      if (cache.tracks.length === 0) await this.localforage.removeItem(CACHE_KEY);
      else await this.localforage.setItem(CACHE_KEY, cache);
    } catch (error) {
      // Storage full or unavailable (private browsing): the app works without the cache.
      console.warn('[TrackService] could not cache the library:', error);
    }
  }

  private clearLegacyCache() {
    if (this.legacyCacheCleared) return;
    this.legacyCacheCleared = true;
    for (const key of LEGACY_CACHE_KEYS) this.localforage.removeItem(key).catch(() => undefined);
  }

  //--------------------------------
  //       FILTERED SELECTION     //
  //--------------------------------
  public selectFilteredTracks(): Observable<Track[]> {
    return this.filteredTracks$;
  }

  /** The first pages of the filtered tracks, for the infinite scroll. */
  public getMore(page: number): Observable<Track[]> {
    return this.filteredTracks$.pipe(map((tracks) => tracks.slice(0, page * TRACKS_PER_SCROLL)));
  }

  public get tracksLength$(): Observable<number> {
    return this.filteredTracks$.pipe(map((tracks) => tracks.length));
  }

  getFilters(): AkitaFilter<TrackState>[] {
    return this.trackFilters.getFilters() as AkitaFilter<TrackState>[];
  }

  setFilter(filter: Partial<AkitaFilter<TrackState>>) {
    this.trackFilters.setFilter(filter);
  }

  removeFilter(id: string) {
    this.trackFilters.removeFilter(id);
  }

  clearFilters() {
    this.trackFilters.clearFilters();
  }

  //--------------------------------
  //        ACTIVE TRACKS         //
  //--------------------------------
  // Sets are used instead of the store's own add/removeActive, which compare
  // every id with every other one: seconds of freeze on a 20 000 track library.
  public addActive(trackIds: string[]) {
    const active = new Set((this.query.getActiveId() ?? []) as string[]);
    const before = active.size;
    for (const id of trackIds ?? []) active.add(id);
    if (active.size !== before) this.store.setActive([...active]);
  }

  public removeActive(trackIds: string[]) {
    const removed = new Set(trackIds ?? []);
    const active = (this.query.getActiveId() ?? []) as string[];
    const remaining = active.filter((id) => !removed.has(id));
    if (remaining.length !== active.length) this.store.setActive(remaining);
  }

  public addAllActive() {
    this.store.setActive([...(this.query.getValue().ids as string[])]);
  }

  public removeAllActive() {
    this.store.setActive([]);
  }
}
