import { TestBed } from '@angular/core/testing';

import { LocalforageService } from './localforage.service';

describe('LocalforageService', () => {
  let service: LocalforageService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(LocalforageService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
