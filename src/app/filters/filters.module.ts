import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FilterViewComponent } from './filter-view/filter-view.component';
import { FilterListComponent } from './filter-list/filter-list.component';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { SliderModule } from 'primeng/slider';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { MatCardModule } from '@angular/material/card';
import { GenreListComponent } from './genre-filters/genre-list/genre-list.component';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { FlexLayoutModule } from '@angular/flex-layout';
import { NzSliderModule } from 'ng-zorro-antd/slider';
import { MatTooltipModule } from '@angular/material/tooltip';

@NgModule({
  declarations: [FilterViewComponent, FilterListComponent, GenreListComponent],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    SliderModule,
    FormsModule,
    BrowserModule,
    BrowserAnimationsModule,
    MatCardModule,
    MatAutocompleteModule,
    MatFormFieldModule,
    MatInputModule,
    MatChipsModule,
    MatIconModule,
    FlexLayoutModule,
    NzSliderModule,
    MatTooltipModule,
  ],
  exports: [FilterViewComponent, FilterListComponent, GenreListComponent],
})
export class FiltersModule {}
