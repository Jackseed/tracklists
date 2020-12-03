import { Injectable } from '@angular/core';
import { CollectionConfig, CollectionService } from 'akita-ng-fire';
import { AuthQuery } from 'src/app/auth/+state';
import { Track, TrackQuery } from 'src/app/tracks/+state';
import { Playlist } from './playlist.model';
import { PlaylistQuery } from './playlist.query';
import { PlaylistState, PlaylistStore } from './playlist.store';

@Injectable({ providedIn: 'root' })
@CollectionConfig({ path: 'playlists' })
export class PlaylistService extends CollectionService<PlaylistState> {
  constructor(
    store: PlaylistStore,
    private query: PlaylistQuery,
    private trackQuery: TrackQuery,
    private authQuery: AuthQuery
  ) {
    super(store);
  }

  public async savePlaylists() {
    const playlistLimit = 50;
    const playlistTracksLimit = 100;
    const audioFeaturesLimit = 100;
    const firebaseWriteLimit = 500;
    const user = this.authQuery.getActive();
    const url = `https://api.spotify.com/v1/users/${user.spotifyId}/playlists`;
    const total = await this.query.getTotalPlaylists(url);

    let playlists: Playlist[] = [];
    let totalPlaylistTracks: Track[] = [];
    let totalPlaylistTrackIds: string[];
    let audioFeatures: Track[] = [];
    let totalPlaylistFullTracks: Track[] = [];

    const playlistCollection = this.db.firestore.collection(this.currentPath);
    const trackCollection = this.db.firestore.collection('tracks');
    const userRef = this.db.firestore.collection('users').doc(user.id);

    // get all the playlists by batches
    for (let j = 0; j <= Math.floor(total / playlistLimit) + 1; j++) {
      const offset = j * playlistLimit;
      const url = `https://api.spotify.com/v1/users/${user.spotifyId}/playlists?limit=${playlistLimit}&offset=${offset}`;
      const lists = await this.query.getPlaylists(url);

      playlists = playlists.concat(lists);
    }

    // get the tracks from all playlists
    for (let m = 0; m < playlists.length; m++) {
      let playlistTracks: Track[] = [];
      console.log(playlists[m].name);
      // get all the playlist tracks by batches
      for (
        let l = 0;
        l <= Math.floor(playlists[m].tracks.total / playlistTracksLimit) + 1;
        l++
      ) {
        const offset = l * playlistTracksLimit;
        const url = `${playlists[m].tracks.href}?limit=${playlistTracksLimit}&offset=${offset}`;
        const formatedTracks = await this.trackQuery.getFormatedPlaylistTracks(
          url
        );

        playlistTracks = playlistTracks.concat(formatedTracks);
      }
      let trackIds = playlistTracks.map((track) => track.id);
      playlists[m].trackIds = trackIds;
      totalPlaylistTracks = totalPlaylistTracks.concat(playlistTracks);
    }

    totalPlaylistTrackIds = totalPlaylistTracks.map((track) => track.id);

    // Get all the audio features by batches
    for (let i = 0; i <= Math.floor(total / audioFeaturesLimit); i++) {
      const bactchTrackIds = totalPlaylistTrackIds.slice(
        audioFeaturesLimit * i,
        audioFeaturesLimit * (i + 1)
      );

      const formatedFeatures = await this.trackQuery.getFormatedAudioFeatures(
        bactchTrackIds
      );
      audioFeatures = audioFeatures.concat(formatedFeatures);
    }

    // concat tracks & audio features
    totalPlaylistFullTracks = totalPlaylistTracks.map((item, i) =>
      Object.assign({}, item, audioFeatures[i])
    );

    // write the playlists by batches
    for (let i = 0; i <= Math.floor(total / firebaseWriteLimit); i++) {
      const bactchPlaylist = playlists.slice(
        firebaseWriteLimit * i,
        firebaseWriteLimit * (i + 1)
      );
      const batch = this.db.firestore.batch();

      for (const playlist of bactchPlaylist) {
        const ref = playlistCollection.doc(playlist.id);
        batch.set(ref, playlist);
      }

      batch
        .commit()
        .then((_) => console.log(`batch of plalist ${i} saved`))
        .catch((error) => console.log(error));
    }

    // write the playlist tracks by batches
    for (
      let n = 0;
      n <= Math.floor(totalPlaylistFullTracks.length / firebaseWriteLimit);
      n++
    ) {
      const bactchTrack = totalPlaylistFullTracks.slice(
        firebaseWriteLimit * n,
        firebaseWriteLimit * (n + 1)
      );
      const batch = this.db.firestore.batch();

      for (const track of bactchTrack) {
        const ref = trackCollection.doc(track.id);
        batch.set(ref, track);
      }

      batch
        .commit()
        .then((_) => console.log(`batch of tracks ${n} saved`))
        .catch((error) => console.log(error));
    }

    const playlistIds = playlists.map((playlist) => playlist.id);
    // write playlist ids in the user doc
    userRef
      .update({ playlistIds })
      .then((_) => console.log('playlistIds saved on user'))
      .catch((error) => console.log(error));
  }
}
