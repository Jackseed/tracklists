import { TestBed } from '@angular/core/testing';

import { SyncPlaylistsGuard } from './sync-playlists.guard';

describe('SyncPlaylistsGuard', () => {
  let guard: SyncPlaylistsGuard;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    guard = TestBed.inject(SyncPlaylistsGuard);
  });

  it('should be created', () => {
    expect(guard).toBeTruthy();
  });
});
