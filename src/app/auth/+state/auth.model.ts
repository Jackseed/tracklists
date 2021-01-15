import { Image } from '../../tracks/+state';

export interface User {
  id: string;
  email?: string;
  token?: string;
  name?: string;
  spotifyId?: string;
  deviceId?: string;
  trackIds?: string[];
  playlistIds?: string[];
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

export function createUser(params: Partial<User>) {
  return {
    id: params.id,
    email: params.email,
    playlistIds: [],
    trackIds: [],
  };
}
