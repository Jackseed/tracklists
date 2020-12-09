import { TestBed } from '@angular/core/testing';

import { GenreGuardGuard } from './genre-guard.guard';

describe('GenreGuardGuard', () => {
  let guard: GenreGuardGuard;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    guard = TestBed.inject(GenreGuardGuard);
  });

  it('should be created', () => {
    expect(guard).toBeTruthy();
  });
});
