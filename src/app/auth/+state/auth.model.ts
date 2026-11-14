import { Timestamp } from 'firebase/firestore';
import { Image } from '../../tracks/+state/track.model';

export interface User {
  uid: string;
  displayName?: string;
  email?: string;
  tokens?: {
    access?: string;
    addedTime?: Timestamp;
  };
  deviceId?: string;
  playlistIds?: string[];
  /** State of the Spotify library import, written by the `importLibrary` Cloud Function. */
  import?: LibraryImport;
  /** Changes every time an import completes: tells the app that its cached tracks are stale. */
  libraryUpdatedAt?: Timestamp;
}

export type ImportPhase = 'starting' | 'playlists' | 'tracks' | 'details' | 'saving';

export interface LibraryImport {
  status: 'running' | 'done' | 'error';
  runId: string;
  phase: ImportPhase;
  /** Overall progress, 0-100. */
  percent: number;
  /** Progress inside the current phase. */
  done: number;
  total: number;
  /** Different tracks found so far: the real size of the library, exact after the `tracks` phase. */
  found?: number;
  /** Heartbeat of the running import. */
  updatedAt?: Timestamp;
  finishedAt?: Timestamp;
  stats?: { tracks: number; playlists: number; skippedPlaylists?: number; likedTracks: number; durationSeconds: number };
  warnings?: string[];
  error?: { code: string; message: string; retryAfterSeconds?: number };
}

export interface Tokens {
  token: string;
  custom_auth_token?: string;
}

export interface Devices {
  devices: Device[];
}

export interface Device {
  id: string;
  is_active: boolean;
  is_private_session: boolean;
  is_restricted: boolean;
  name: string;
  type: string;
  volume_percent: number;
}

export interface SpotifyUser {
  country: string;
  display_name: string;
  email: string;
  explicit_content: { [key: string]: string };
  external_urls: { [key: string]: string };
  followers: {
    href: string;
    total: number;
  };
  href: string;
  id: string;
  images: Image[];
  product: string;
  type: string;
  uri: string;
}
