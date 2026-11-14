import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, combineLatest, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged, filter, map, switchMap } from 'rxjs/operators';
import { AUTH, currentUser } from '../core/firebase';
import { PlaylistQuery } from '../playlists/+state/playlist.query';
import { PlaylistService } from '../playlists/+state/playlist.service';
import { AuthQuery } from './+state/auth.query';
import { AuthService } from './+state/auth.service';

const sameIds = (a: string[], b: string[]) => a.length === b.length && a.every((id, i) => id === b[i]);

/**
 * Live data of the signed-in user while the app is open: their own user
 * document (tokens, playlist ids, import progress) and their playlists.
 */
@Injectable({ providedIn: 'root' })
export class SessionService {
  private auth = inject(AUTH);
  private authService = inject(AuthService);
  private authQuery = inject(AuthQuery);
  private playlistService = inject(PlaylistService);
  private playlistQuery = inject(PlaylistQuery);

  private subscriptions?: Subscription;
  private readonly playlistsSynced = new BehaviorSubject(false);
  /** False until the playlists of the user have been loaded once. */
  readonly playlistsSynced$ = this.playlistsSynced.asObservable();

  /** Resolves `true` once the user document is loaded, `false` if there is no usable session. */
  async start(): Promise<boolean> {
    this.stop();
    const firebaseUser = await currentUser(this.auth);
    if (!firebaseUser) return false;

    const subscriptions = new Subscription();
    this.subscriptions = subscriptions;
    const loaded = await new Promise<boolean>((resolve) => {
      subscriptions.add(
        this.authService.syncUser(firebaseUser.uid).subscribe({
          next: (user) => resolve(!!user),
          error: (error) => {
            console.error('[Session] could not load the user document:', error);
            resolve(false);
          },
        })
      );
    });
    if (!loaded) {
      this.stop();
      return false;
    }

    const uid = firebaseUser.uid;
    subscriptions.add(
      this.authQuery
        .selectActive()
        .pipe(
          map((user) => user?.playlistIds ?? []),
          distinctUntilChanged(sameIds),
          switchMap((ids) => {
            this.playlistsSynced.next(false);
            // Playlists cached during a previous visit are enough to show the app;
            // Firestore then brings them up to date in the background.
            this.playlistService.restoreFromCache(uid, ids).then((restored) => {
              if (restored && sameIds(ids, this.authQuery.getActive()?.playlistIds ?? [])) this.playlistsSynced.next(true);
            });
            return this.playlistService.sync(ids);
          })
        )
        .subscribe({
          next: () => this.playlistsSynced.next(true),
          error: (error) => {
            console.error('[Session] playlist sync failed:', error);
            this.playlistsSynced.next(true);
          },
        })
    );
    // Keeps the cache current: after the first sync, and when a playlist changes (likes, new import).
    subscriptions.add(
      combineLatest([this.playlistsSynced$, this.playlistQuery.selectAll()])
        .pipe(
          filter(([synced]) => synced),
          debounceTime(2000)
        )
        .subscribe(([, playlists]) => this.playlistService.saveToCache(uid, playlists))
    );
    return true;
  }

  stop(): void {
    this.subscriptions?.unsubscribe();
    this.subscriptions = undefined;
    this.playlistsSynced.next(false);
  }
}
