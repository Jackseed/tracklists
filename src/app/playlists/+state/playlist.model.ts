import { SpotifyUser } from '../../auth/+state/auth.model';
import { Image, SpotifyTracks } from '../../tracks/+state/track.model';

export interface Playlist {
  collaborative?: boolean;
  description?: string;
  external_urls?: { [key: string]: string };
  href?: string;
  id?: string;
  images?: Image[];
  name?: string;
  owner?: Partial<SpotifyUser>;
  public?: boolean | null;
  snapshot_id?: string;
  tracks?: SpotifyTracks;
  type?: string;
  uri?: string;
  trackIds?: string[];
}

export interface PlaylistPaging {
  href: string;
  items: Playlist[];
  limit: number;
  next: string;
  offset: number;
  previous: string;
  total: number;
}
