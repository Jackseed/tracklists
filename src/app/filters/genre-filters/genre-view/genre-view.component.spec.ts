import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GenreViewComponent } from './genre-view.component';

describe('GenreViewComponent', () => {
  let component: GenreViewComponent;
  let fixture: ComponentFixture<GenreViewComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ GenreViewComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(GenreViewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
