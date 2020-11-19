export interface User {
  id: string;
  email?: string;
  token?: string;
}

export function createUser(params: Partial<User>) {
  return {
    id: params.id,
    email: params.email,
  };
}
