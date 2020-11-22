export interface User {
  id: string;
  email?: string;
  token?: string;
  spotifyId?: string;
  likedTracksIds?: string[];
}

export function createUser(params: Partial<User>) {
  return {
    id: params.id,
    email: params.email,
  };
}
