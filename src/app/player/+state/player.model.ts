import { ID } from '@datorama/akita';
import { Track } from 'src/app/tracks/+state';

export interface PlayerTrack extends Track {
  position: number;
  paused: boolean;
  trackOrder: number;
}


