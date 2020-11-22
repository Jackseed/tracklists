import { TestBed } from '@angular/core/testing';

import { TrackGuard } from './track.guard';

describe('TrackGuard', () => {
  let guard: TrackGuard;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    guard = TestBed.inject(TrackGuard);
  });

  it('should be created', () => {
    expect(guard).toBeTruthy();
  });
});
