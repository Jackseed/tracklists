import { Injectable } from '@angular/core';
import { TracksStore, TracksState } from './tracks.store';
import { CollectionConfig, CollectionService } from 'akita-ng-fire';

@Injectable({ providedIn: 'root' })
@CollectionConfig({ path: 'tracks' })
export class TracksService extends CollectionService<TracksState> {

  constructor(store: TracksStore) {
    super(store);
  }

}
