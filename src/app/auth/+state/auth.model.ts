export interface User {
  id: string;
  email?: string;
  spotifyToken?: string;
}

export function createUser(params: Partial<User>) {
  return {
    id: params.id,
    email: params.email,
  };
}
