import { Track } from '../../tracks/+state/track.model';

export interface PlayerTrack extends Track {
  position: number;
  paused: boolean;
  trackOrder?: number;
}
