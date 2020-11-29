import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FilterViewComponent } from './filter-view.component';

describe('FilterViewComponent', () => {
  let component: FilterViewComponent;
  let fixture: ComponentFixture<FilterViewComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ FilterViewComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(FilterViewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
