import { TestBed } from '@angular/core/testing';

import { SyncTracksGuard } from './sync-tracks.guard';

describe('SyncTracksGuard', () => {
  let guard: SyncTracksGuard;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    guard = TestBed.inject(SyncTracksGuard);
  });

  it('should be created', () => {
    expect(guard).toBeTruthy();
  });
});
