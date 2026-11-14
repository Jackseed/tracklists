import { SpotifyUser } from '../../auth/+state/auth.model';

export interface Track {
  id: string;
  added_at?: string;
  added_by?: SpotifyUser;
  uri?: string;
  album?: Album;
  artists?: Artist[];
  genres?: string[];
  duration_ms?: number;
  name?: string;
  popularity?: number;
  key?: number;
  mode?: number;
  time_signature?: number;
  acousticness?: number;
  danceability?: number;
  energy?: number;
  instrumentalness?: number;
  liveness?: number;
  loudness?: number;
  speechiness?: number;
  valence?: number;
  tempo?: number;
  userIds?: string[];
}

export interface Album {
  id?: string;
  name?: string;
  images?: Image[];
  genres?: string[];
  release_year?: number;
  release_date?: string;
  release_date_precision?: 'year' | 'month' | 'day';
}

export interface SpotifyAlbum {
  id?: string;
  name?: string;
  images?: Image[];
  genres?: string[];
  release_date?: string;
  release_date_precision?: 'year' | 'month' | 'day';
  album_type: string;
  artists: Artist[];
  available_markets: string[];
  copyrights: Copyright[];
  external_ids: { [key: string]: string };
  external_url: { [key: string]: string };
  href: string;
  label: string;
  popularity: number;
  track: Track[];
  type: string;
  uri: string;
}

export interface Copyright {
  text: string;
  type: string;
}

export interface Artist {
  id: string;
  name: string;
  images: Image[];
  genres?: string[];
}

export interface Image {
  url: string;
  height: number;
  width: number;
}

export interface SpotifyTrack extends Track {
  // spotify parameters
  available_markets: string[];
  disc_number: number;
  explicit: boolean;
  external_ids: { [key: string]: string };
  external_urls: { [key: string]: string };
  href: string;
  is_playable: boolean;
  linked_from: {
    externarl_urls: { [key: string]: string };
    href: string;
    id: string;
    type: string;
    uri: string;
  };
  restrictions: { [key: string]: string };
  preview_url: string;
  track_number: number;
  type: string;
  uri: string;
}

export interface SpotifySavedTrack {
  added_at: string;
  track: SpotifyTrack;
}

export interface SpotifyPaging {
  href: string;
  items: object[];
  limit: number;
  next: string;
  offset: number;
  previous: string;
  total: number;
}

export interface SpotifyTracks {
  href: string;
  total: number;
}

export interface SpotifyPlaylistTrack {
  added_at?: string;
  added_by?: SpotifyUser;
  is_local?: boolean;
  track: SpotifyTrack;
}

export interface SpotifyAudioFeatures {
  key?: number;
  mode?: number;
  time_signature?: number;
  acousticness?: number;
  danceability?: number;
  energy?: number;
  instrumentalness?: number;
  liveness?: number;
  loudness?: number;
  speechiness?: number;
  valence?: number;
  tempo?: number;
  // Spotify
  analysis_url: string;
  duration_ms: number;
  id: string;
  track_href: string;
  type: string;
  uri: string;
}

export interface MinMax {
  min: number;
  max: number;
}
