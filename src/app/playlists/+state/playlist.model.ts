import { SpotifyUser } from 'src/app/auth/+state';
import { Image, SpotifyTracks } from 'src/app/tracks/+state';

export interface Playlist {
  collaborative?: boolean;
  description?: string;
  external_urls?: { [key: string]: string };
  href?: string;
  id?: string;
  images?: Image[];
  name?: string;
  owner?: SpotifyUser;
  public?: boolean | null;
  snapshot_id?: string;
  tracks?: SpotifyTracks;
  type?: string;
  uri?: string;
  trackIds?: string[];
  genreIds?: string[];
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
