import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { QueryEntity } from '@datorama/akita';
import { Observable, timer } from 'rxjs';
import {
  delayWhen,
  filter,
  first,
  map,
  retryWhen,
  take,
  tap,
} from 'rxjs/operators';
import { AuthQuery } from 'src/app/auth/+state';
import { Playlist, PlaylistPaging } from './playlist.model';
import { PlaylistState, PlaylistStore } from './playlist.store';

@Injectable({ providedIn: 'root' })
export class PlaylistQuery extends QueryEntity<PlaylistState> {
  constructor(
    protected store: PlaylistStore,
    private authQuery: AuthQuery,
    private http: HttpClient
  ) {
    super(store);
  }

  private async getHeaders() {
    const user = await this.authQuery.getActive();
    const headers = new HttpHeaders().set(
      'Authorization',
      'Bearer ' + user.token
    );
    return headers;
  }

  public async getPlaylistPagingPromised(
    url: string
  ): Promise<Observable<PlaylistPaging>> {
    const headers = await this.getHeaders();
    const user = this.authQuery.getActive();

    const playlists: Observable<PlaylistPaging> = this.http
      .get<PlaylistPaging>(`${url}`, {
        headers,
      })
      .pipe(
        retryWhen((error) => {
          return error.pipe(
            tap((error) => console.log('error status: ', error.status)),
            filter((error) => error.status === 429),
            delayWhen(() => timer(5000)),
            tap(() => console.log('retrying...')),
            take(3)
          );
        })
      );

    return playlists;
  }

  public async getPlaylistPaging(url: string): Promise<PlaylistPaging> {
    return await (await this.getPlaylistPagingPromised(url))
      .pipe(first())
      .toPromise();
  }

  public async getTotalPlaylists(url: string): Promise<number> {
    const playlists = await this.getPlaylistPaging(url);
    return playlists.total;
  }

  public async getPlaylists(url: string): Promise<Playlist[]> {
    return await (await this.getPlaylistPagingPromised(url))
      .pipe(
        map((paging) => paging.items),
        first()
      )
      .toPromise();
  }
}
