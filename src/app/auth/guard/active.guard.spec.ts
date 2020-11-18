import { TestBed } from '@angular/core/testing';

import { ActiveGuard } from './active.guard';

describe('ActiveGuard', () => {
  let guard: ActiveGuard;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    guard = TestBed.inject(ActiveGuard);
  });

  it('should be created', () => {
    expect(guard).toBeTruthy();
  });
});
