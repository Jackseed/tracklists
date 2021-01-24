export interface Genre {
  id: string;
  userIds: string[];
  playlists: {
    [playlistId: string]: string[];
  };
}
