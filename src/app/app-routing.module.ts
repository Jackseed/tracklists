import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { LoginComponent } from './auth/login/login.component';
import { HomepageComponent } from './homepage/homepage.component';
import {
  AngularFireAuthGuard,
  redirectUnauthorizedTo,
} from '@angular/fire/auth-guard';
import { ActiveGuard } from './auth/guard/active.guard';
import { TrackGuard } from './tracks/+state/guard/track.guard';
import { SyncPlaylistsGuard } from './playlists/+state/guard/sync-playlists.guard';

const redirectUnauthorizedToLogin = () => redirectUnauthorizedTo(['welcome']);

const routes: Routes = [
  { path: '', redirectTo: '/home', pathMatch: 'full' },
  { path: 'welcome', component: LoginComponent },
  {
    path: 'home',
    canActivate: [AngularFireAuthGuard, ActiveGuard],
    data: { authGuardPipe: redirectUnauthorizedToLogin },
    canDeactivate: [ActiveGuard],
    children: [
      {
        path: '',
        canActivate: [TrackGuard],
        canDeactivate: [TrackGuard],
        children: [
          {
            path: '',
            canActivate: [SyncPlaylistsGuard],
            canDeactivate: [SyncPlaylistsGuard],
            component: HomepageComponent,
          },
        ],
      },
    ],
  },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule],
})
export class AppRoutingModule {}
