import { Injectable, inject } from '@angular/core';
import { applyTransaction } from '@datorama/akita';
import { arrayRemove, arrayUnion, doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { Observable } from 'rxjs';
import { FIRESTORE } from '../../core/firebase';
import { LocalforageService } from '../../utils/localforage.service';
import { Playlist } from './playlist.model';
import { PlaylistStore } from './playlist.store';

/** The playlists as cached in the browser (IndexedDB) between visits. */
interface PlaylistCache {
  version: 1;
  uid: string;
  playlists: Playlist[];
}

const CACHE_KEY = 'playlists';

@Injectable({ providedIn: 'root' })
export class PlaylistService {
  private store = inject(PlaylistStore);
  private firestore = inject(FIRESTORE);
  private localforage = inject(LocalforageService);

  /**
   * Puts the playlists cached during a previous visit in the store, so that the
   * app can be shown before Firestore has answered for each of them. Returns
   * false when the cache does not cover all the given playlists.
   */
  public async restoreFromCache(uid: string, ids: string[]): Promise<boolean> {
    if (ids.length === 0) return false;
    try {
      const cache = await this.localforage.getItem<PlaylistCache>(CACHE_KEY);
      if (cache?.version !== 1 || cache.uid !== uid || !Array.isArray(cache.playlists)) return false;
      const cached = new Map(cache.playlists.map((playlist) => [playlist.id, playlist]));
      if (!ids.every((id) => cached.has(id))) return false;
      this.store.upsertMany(ids.map((id) => cached.get(id)));
      return true;
    } catch (error) {
      console.warn('[PlaylistService] unreadable playlist cache:', error);
      return false;
    }
  }

  public async saveToCache(uid: string, playlists: Playlist[]): Promise<void> {
    try {
      const cache: PlaylistCache = { version: 1, uid, playlists };
      await this.localforage.setItem(CACHE_KEY, cache);
    } catch (error) {
      // Storage full or unavailable: the app works without the cache.
      console.warn('[PlaylistService] could not cache the playlists:', error);
    }
  }

  /**
   * Keeps the store in sync with the given playlist documents. Emits once all
   * of them have been loaded; unsubscribing stops the listeners.
   */
  public sync(ids: string[]): Observable<void> {
    return new Observable((subscriber) => {
      const wanted = new Set(ids);
      this.store.setActive([]);
      this.store.remove((playlist: Playlist) => !wanted.has(playlist.id));
      if (ids.length === 0) {
        subscriber.next();
        return undefined;
      }

      // Hundreds of documents answer within the same tick: apply them to the store in one go.
      const pending = new Map<string, Playlist | null>();
      const waitingFor = new Set(ids);
      let scheduled = false;
      const flush = () => {
        scheduled = false;
        applyTransaction(() => {
          for (const [id, playlist] of pending) {
            if (playlist) this.store.upsert(id, playlist);
            else this.store.remove(id);
          }
        });
        pending.clear();
        if (waitingFor.size === 0 && !subscriber.closed) subscriber.next();
      };
      const receive = (id: string, playlist: Playlist | null) => {
        pending.set(id, playlist);
        waitingFor.delete(id);
        if (!scheduled) {
          scheduled = true;
          setTimeout(flush);
        }
      };

      const unsubscribes = ids.map((id) =>
        onSnapshot(
          doc(this.firestore, `playlists/${id}`),
          (snapshot) => receive(id, snapshot.exists() ? { ...(snapshot.data() as Playlist), id } : null),
          (error) => {
            console.warn(`[PlaylistService] could not load playlist ${id}:`, error);
            receive(id, null);
          }
        )
      );
      return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
    });
  }

  public addActive(playlistIds: string[]) {
    this.store.addActive(playlistIds);
  }

  public removeActive(playlistIds: string[]) {
    this.store.removeActive(playlistIds);
  }

  public toggleActive(playlistId: string) {
    this.store.toggleActive(playlistId);
  }

  public addTrack(playlistId: string, trackId: string) {
    return updateDoc(doc(this.firestore, `playlists/${playlistId}`), { trackIds: arrayUnion(trackId) });
  }

  public removeTrack(playlistId: string, trackId: string) {
    return updateDoc(doc(this.firestore, `playlists/${playlistId}`), { trackIds: arrayRemove(trackId) });
  }
}
