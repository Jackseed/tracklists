import { TestBed } from '@angular/core/testing';
import { FIRESTORE } from '../../core/firebase';
import { LocalforageService } from '../../utils/localforage.service';
import { Playlist } from './playlist.model';
import { PlaylistQuery } from './playlist.query';
import { PlaylistService } from './playlist.service';

class FakeStorage {
  items = new Map<string, unknown>();
  getItem = async (key: string) => this.items.get(key) ?? null;
  setItem = async (key: string, value: unknown) => (this.items.set(key, structuredClone(value)), value);
  removeItem = async (key: string) => void this.items.delete(key);
  clear = async () => this.items.clear();
}

const playlists: Playlist[] = [
  { id: 'a', name: 'First', trackIds: ['t1', 't2'] },
  { id: 'meLikedTracks', name: 'Liked tracks', type: 'likedTracks', trackIds: ['t2'] },
];

describe('PlaylistService cache', () => {
  let service: PlaylistService;
  let query: PlaylistQuery;
  let storage: FakeStorage;

  beforeEach(() => {
    storage = new FakeStorage();
    TestBed.configureTestingModule({
      providers: [
        { provide: LocalforageService, useValue: storage },
        { provide: FIRESTORE, useValue: {} },
      ],
    });
    service = TestBed.inject(PlaylistService);
    query = TestBed.inject(PlaylistQuery);
  });

  it('shows the playlists of the previous visit', async () => {
    await service.saveToCache('me', playlists);
    expect(await service.restoreFromCache('me', ['a', 'meLikedTracks'])).toBe(true);
    expect(query.getAll().map((playlist) => playlist.name)).toEqual(['First', 'Liked tracks']);
  });

  it('only restores the playlists that are still in the library', async () => {
    await service.saveToCache('me', playlists);
    expect(await service.restoreFromCache('me', ['a'])).toBe(true);
    expect(query.getAll().map((playlist) => playlist.id)).toEqual(['a']);
  });

  it('does not use a cache that misses a playlist', async () => {
    await service.saveToCache('me', playlists);
    expect(await service.restoreFromCache('me', ['a', 'new-playlist'])).toBe(false);
    expect(query.getCount()).toBe(0);
  });

  it("does not use another account's cache, nor an empty one", async () => {
    await service.saveToCache('someone-else', playlists);
    expect(await service.restoreFromCache('me', ['a'])).toBe(false);
    expect(await service.restoreFromCache('me', [])).toBe(false);
    storage.items.clear();
    expect(await service.restoreFromCache('me', ['a'])).toBe(false);
  });
});
