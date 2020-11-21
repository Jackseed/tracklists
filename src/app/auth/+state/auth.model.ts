export interface User {
  id: string;
  email?: string;
  token?: string;
  spotifyId?: string;
  likedTracks?: string[];
}

export function createUser(params: Partial<User>) {
  return {
    id: params.id,
    email: params.email,
  };
}
