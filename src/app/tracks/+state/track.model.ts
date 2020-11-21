import { Timestamp } from '@google-cloud/firestore';

export interface Track {
  id: string;
  isLiked: boolean;
  added_at: Timestamp;
  album: Album;
  artists: Artist[];
  duration: number;
  name: string;
  popularity: number;
  key: number;
  mode: number;
  time_signature: number;
  acousticness: number;
  danceability: number;
  energy: number;
  instrumentalness: number;
  liveness: number;
  loudness: number;
  speechiness: number;
  valence: number;
  tempo: number;
}

export interface Album {
  id: string;
  name: string;
  images: Image[];
  genres: string[];
  release_date: string;
  release_date_precision: 'year' | 'month' | 'day';
}

export interface Artist {
  id: string;
  name: string;
  images: Image[];
}

export interface Image {
  url: string;
  height: number;
  width: number;
}

export function createTrack(params: Partial<Track>) {
  return {
    id: params.id,
    isLiked: params.isLiked,
    added_at: params.added_at,
    name: params.name,
    artists: params.artists.forEach((artist) => createArtist(artist)),
    album: createAlbum(params.album),
    duration: params.duration,
    popularity: params.popularity,
    key: params.key,
    mode: params.mode,
    time_signature: params.time_signature,
    acousticness: params.acousticness,
    danceability: params.danceability,
    energy: params.energy,
    instrumentalness: params.instrumentalness,
    liveness: params.liveness,
    loudness: params.loudness,
    speechiness: params.speechiness,
    valence: params.valence,
    tempo: params.tempo,
  };
}

export function createAlbum(params: Partial<Album>) {
  return {
    id: params.id,
    name: params.name,
    images: params.images.forEach((image) => createImage(image)),
    genres: params.genres ? params.genres : [],
    release_date: params.release_date,
    release_date_precision: params.release_date_precision,
  };
}

export function createArtist(params: Partial<Artist>) {
  return {
    id: params.id,
    name: params.name,
    images: params.images.forEach((image) => createImage(image)),
  };
}

export function createImage(params: Partial<Image>) {
  return {
    url: params.url,
    height: params.height,
    width: params.width,
  };
}
