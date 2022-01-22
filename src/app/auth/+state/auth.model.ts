import { Timestamp } from '@angular/fire/firestore';
import { Image } from '../../tracks/+state';

export interface User {
  uid: string;
  displayName?: string;
  email?: string;
  tokens?: {
    access?: string;
    addedTime?: Timestamp;
    refresh?: string;
  };
  deviceId?: string;
  trackIds?: string[];
  playlistIds?: string[];
}

export interface Tokens {
  token: string;
  refresh_token: string;
  custom_auth_token: string;
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

export function createUser(params: Partial<User>): User {
  return {
    uid: params.uid,
    email: params.email,
    playlistIds: [],
    trackIds: [],
  };
}
