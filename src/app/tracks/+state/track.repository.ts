import { Injectable, inject } from '@angular/core';
import {
  collection,
  getDocsFromServer,
  limit,
  query,
  QueryConstraint,
  QueryDocumentSnapshot,
  startAfter,
  where,
} from 'firebase/firestore';
import { FIRESTORE } from '../../core/firebase';
import { Track } from './track.model';

/** Tracks read from Firestore per request. */
const PAGE_SIZE = 2500;
const RETRYABLE = ['unavailable', 'deadline-exceeded', 'resource-exhausted', 'aborted'];

/** Reads the tracks of a user from Firestore. */
@Injectable({ providedIn: 'root' })
export class TrackRepository {
  private firestore = inject(FIRESTORE);

  /**
   * All the tracks linked to the user, read page by page (a single query for a
   * large library is slow to answer and fails as a whole).
   */
  async fetchUserTracks(uid: string, onProgress: (loaded: number) => void = () => undefined): Promise<Track[]> {
    const tracks: Track[] = [];
    let cursor: QueryDocumentSnapshot | undefined;
    for (;;) {
      const constraints: QueryConstraint[] = [where('userIds', 'array-contains', uid), limit(PAGE_SIZE)];
      if (cursor) constraints.push(startAfter(cursor));
      // From the server only: an offline answer from the (empty) local cache must not pass for an empty library.
      const snapshot = await this.withRetry(() => getDocsFromServer(query(collection(this.firestore, 'tracks'), ...constraints)));
      for (const document of snapshot.docs) {
        // `userIds` lists every user having the track: not needed here, and not ours to keep around.
        const { userIds: _userIds, v: _version, ...track } = document.data();
        tracks.push({ ...track, id: document.id } as Track);
      }
      onProgress(tracks.length);
      if (snapshot.size < PAGE_SIZE) return tracks;
      cursor = snapshot.docs[snapshot.docs.length - 1];
    }
  }

  private async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await operation();
      } catch (error) {
        const code = String((error as { code?: string })?.code ?? '').replace('firestore/', '');
        if (attempt >= 4 || !RETRYABLE.includes(code)) throw error;
        await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** (attempt - 1)));
      }
    }
  }
}
