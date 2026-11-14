import { TestBed } from '@angular/core/testing';
import { Timestamp } from 'firebase/firestore';
import { firstValueFrom } from 'rxjs';
import { AuthStore } from '../../auth/+state/auth.store';
import { LocalforageService } from '../../utils/localforage.service';
import { Track } from './track.model';
import { TrackQuery } from './track.query';
import { TrackRepository } from './track.repository';
import { TrackService } from './track.service';

const track = (id: string, extra: Partial<Track> = {}): Track => ({ id, name: `Track ${id}`, uri: `spotify:track:${id}`, ...extra });
const VERSION = 1_700_000_000_000;

class FakeStorage {
  items = new Map<string, unknown>();
  getItem = async (key: string) => this.items.get(key) ?? null;
  setItem = async (key: string, value: unknown) => (this.items.set(key, structuredClone(value)), value);
  removeItem = async (key: string) => void this.items.delete(key);
  clear = async () => this.items.clear();
}

class FakeRepository {
  tracks: Track[] = [track('a'), track('b'), track('c')];
  calls = 0;
  failure: unknown = null;
  async fetchUserTracks(_uid: string, onProgress: (loaded: number) => void) {
    this.calls++;
    if (this.failure) throw this.failure;
    onProgress(this.tracks.length);
    return this.tracks;
  }
}

describe('TrackService', () => {
  let service: TrackService;
  let query: TrackQuery;
  let storage: FakeStorage;
  let repository: FakeRepository;

  function setup(user: { uid: string; libraryUpdatedAt?: number | null } | null = { uid: 'me', libraryUpdatedAt: VERSION }) {
    storage = new FakeStorage();
    repository = new FakeRepository();
    TestBed.configureTestingModule({
      providers: [
        { provide: LocalforageService, useValue: storage },
        { provide: TrackRepository, useValue: repository },
      ],
    });
    if (user) {
      const store = TestBed.inject(AuthStore);
      store.upsert(user.uid, { uid: user.uid, libraryUpdatedAt: user.libraryUpdatedAt ? Timestamp.fromMillis(user.libraryUpdatedAt) : undefined });
      store.setActive(user.uid);
    }
    service = TestBed.inject(TrackService);
    query = TestBed.inject(TrackQuery);
  }
  const ids = () => query.getAll().map((item) => item.id);
  const ui = () => query.getValue().ui;

  describe('loadLibrary', () => {
    it('starts in the loading state', () => {
      setup();
      expect(ui().loading).toBe(true);
    });

    it('reads Firestore when nothing is cached, then caches the result with its version', async () => {
      setup();
      await service.loadLibrary();
      expect(ids()).toEqual(['a', 'b', 'c']);
      expect(ui()).toEqual({ loading: false, loaded: 3, error: null });
      expect(storage.items.get('library')).toMatchObject({ version: 2, uid: 'me', libraryUpdatedAt: VERSION });
    });

    it('uses the cache alone when it matches the library version: no Firestore read', async () => {
      setup();
      storage.items.set('library', { version: 2, uid: 'me', libraryUpdatedAt: VERSION, tracks: [track('cached')] });
      await service.loadLibrary();
      expect(ids()).toEqual(['cached']);
      expect(repository.calls).toBe(0);
      expect(ui().loading).toBe(false);
    });

    it('refreshes a cache made before the last import', async () => {
      setup();
      storage.items.set('library', { version: 2, uid: 'me', libraryUpdatedAt: VERSION - 1, tracks: [track('old')] });
      await service.loadLibrary();
      expect(repository.calls).toBe(1);
      expect(ids()).toEqual(['a', 'b', 'c']);
      expect(storage.items.get('library')).toMatchObject({ libraryUpdatedAt: VERSION });
    });

    it('always refreshes for accounts imported before versions existed', async () => {
      setup({ uid: 'me', libraryUpdatedAt: null });
      storage.items.set('library', { version: 2, uid: 'me', libraryUpdatedAt: null, tracks: [track('old')] });
      await service.loadLibrary();
      expect(repository.calls).toBe(1);
      expect(ids()).toEqual(['a', 'b', 'c']);
    });

    it("ignores another account's cache and the previous cache format", async () => {
      setup();
      storage.items.set('library', { version: 2, uid: 'someone-else', libraryUpdatedAt: VERSION, tracks: [track('theirs')] });
      storage.items.set('trackStore', '{"entities":{}}');
      await service.loadLibrary();
      expect(ids()).toEqual(['a', 'b', 'c']);
      expect(storage.items.has('trackStore')).toBe(false);
    });

    it('reports a failure when there is nothing to show', async () => {
      setup();
      repository.failure = new Error('offline');
      await service.loadLibrary();
      expect(ui().loading).toBe(false);
      expect(ui().error).toMatch(/could not be loaded/);
      expect(ids()).toEqual([]);
    });

    it('keeps the cached tracks when the refresh fails', async () => {
      setup();
      storage.items.set('library', { version: 2, uid: 'me', libraryUpdatedAt: VERSION - 1, tracks: [track('old')] });
      repository.failure = new Error('offline');
      await service.loadLibrary();
      expect(ids()).toEqual(['old']);
      expect(ui().error).toBeNull();
    });

    it('reloads from Firestore after an import, even with tracks on screen', async () => {
      setup();
      await service.loadLibrary();
      repository.tracks = [track('a'), track('z')];
      TestBed.inject(AuthStore).update('me', { libraryUpdatedAt: Timestamp.fromMillis(VERSION + 5000) });
      await service.loadLibrary();
      expect(repository.calls).toBe(2);
      expect(ids()).toEqual(['a', 'z']);
      expect(storage.items.get('library')).toMatchObject({ libraryUpdatedAt: VERSION + 5000 });
    });

    it('does not cache an empty library', async () => {
      setup();
      repository.tracks = [];
      await service.loadLibrary();
      expect(storage.items.has('library')).toBe(false);
      expect(ui()).toEqual({ loading: false, loaded: 0, error: null });
    });

    it('does nothing without a signed-in user', async () => {
      setup(null);
      await service.loadLibrary();
      expect(repository.calls).toBe(0);
    });
  });

  describe('selection and filters', () => {
    beforeEach(async () => {
      setup();
      repository.tracks = [track('a', { tempo: 90 }), track('b', { tempo: 120 }), track('c', { tempo: 150 }), track('d')];
      await service.loadLibrary();
    });
    const filtered = async () => (await firstValueFrom(service.selectFilteredTracks())).map((item) => item.id);

    it('selects nothing until a playlist is picked', async () => {
      expect(await filtered()).toEqual([]);
    });

    it('adds and removes selected tracks without duplicates', async () => {
      service.addActive(['a', 'b']);
      service.addActive(['b', 'c']);
      expect(query.getActiveId()).toEqual(['a', 'b', 'c']);
      service.removeActive(['a', 'zzz']);
      expect(await filtered()).toEqual(['b', 'c']);
      service.addAllActive();
      expect(await filtered()).toEqual(['a', 'b', 'c', 'd']);
      service.removeAllActive();
      expect(await filtered()).toEqual([]);
    });

    it('applies filters to the selected tracks only', async () => {
      service.addActive(['a', 'b', 'd']);
      service.setFilter({ id: 'tempo', predicate: (item) => typeof item.tempo === 'number' && item.tempo >= 100 });
      expect(await filtered()).toEqual(['b']);
      service.removeFilter('tempo');
      expect(await filtered()).toEqual(['a', 'b', 'd']);
    });

    it('pages the selection for the infinite scroll and counts it', async () => {
      service.addAllActive();
      expect((await firstValueFrom(service.getMore(0))).length).toBe(0);
      expect((await firstValueFrom(service.getMore(1))).length).toBe(4);
      expect(await firstValueFrom(service.tracksLength$)).toBe(4);
    });
  });
});
