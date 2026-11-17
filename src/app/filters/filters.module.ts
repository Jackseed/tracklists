import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FilterViewComponent } from './filter-view/filter-view.component';
import { FilterListComponent } from './filter-list/filter-list.component';
import { FilterPanelComponent } from './filter-panel/filter-panel.component';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { GenreListComponent } from './genre-filters/genre-list/genre-list.component';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { FlexLayoutModule } from '@ngbracket/ngx-layout';
import { NzSliderModule } from 'ng-zorro-antd/slider';
import { MatTooltipModule } from '@angular/material/tooltip';

@NgModule({
  declarations: [FilterViewComponent, FilterListComponent, GenreListComponent, FilterPanelComponent],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    MatAutocompleteModule,
    MatFormFieldModule,
    MatChipsModule,
    MatIconModule,
    FlexLayoutModule,
    NzSliderModule,
    MatTooltipModule,
  ],
  exports: [FilterViewComponent, FilterListComponent, GenreListComponent, FilterPanelComponent],
})
export class FiltersModule {}
