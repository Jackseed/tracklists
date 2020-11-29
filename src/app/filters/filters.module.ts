import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FilterViewComponent } from './filter-view/filter-view.component';
import { FilterListComponent } from './filter-list/filter-list.component';
import { ReactiveFormsModule } from '@angular/forms';

@NgModule({
  declarations: [FilterViewComponent, FilterListComponent],
  imports: [CommonModule, ReactiveFormsModule],
  exports: [FilterViewComponent, FilterListComponent],
})
export class FiltersModule {}
