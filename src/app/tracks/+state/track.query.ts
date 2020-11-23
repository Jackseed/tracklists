import { Injectable } from '@angular/core';
import { QueryEntity } from '@datorama/akita';
import { TrackStore, TrackState } from './track.store';
import { AuthQuery } from 'src/app/auth/+state';
import {
  HttpClient,
  HttpErrorResponse,
  HttpHeaders,
} from '@angular/common/http';
import {
  catchError,
  delayWhen,
  filter,
  map,
  retryWhen,
  take,
  tap,
} from 'rxjs/operators';
import { combineLatest, timer } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class TrackQuery extends QueryEntity<TrackState> {
  constructor(
    protected store: TrackStore,

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

  public async getLikedTracks(url: string) {
    const headers = await this.getHeaders();

    const likedTracks = await this.http
      .get(`${url}`, {
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

    return likedTracks;
  }

  private handleError(error: HttpErrorResponse) {
    if (error.error instanceof ErrorEvent) {
      // A client-side or network error occurred. Handle it accordingly.
      console.error('An error occurred:', error.error.message);
    } else {
      // The backend returned an unsuccessful response code.
      // The response body may contain clues as to what went wrong.
      console.error(
        `Backend returned code ${error.status}, ` + `body was: ${error.error}`
      );
    }
    // Return an observable with a user-facing error message.
    return throwError('Something bad happened; please try again later.');
  }

  public async getAudioFeatures(trackId: string) {
    const headers = await this.getHeaders();
    const url = 'https://api.spotify.com/v1/audio-features/';
    const audioAnalysis = await this.http.get(`${url + trackId}`, { headers });
    return audioAnalysis;
  }
}
