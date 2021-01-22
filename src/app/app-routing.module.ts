import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { LoginComponent } from './auth/login/login.component';
import { HomepageComponent } from './homepage/homepage.component';
import {
  AngularFireAuthGuard,
  redirectLoggedInTo,
  redirectUnauthorizedTo,
} from '@angular/fire/auth-guard';
import { ActiveGuard } from './auth/guard/active.guard';
import { SyncPlaylistsGuard } from './playlists/+state/guard/sync-playlists.guard';
import { SyncTracksGuard } from './tracks/+state/guard/sync-tracks.guard';

const redirectUnauthorizedToLogin = () => redirectUnauthorizedTo(['welcome']);
const redirectLoggedInToHome = () => redirectLoggedInTo(['home']);

const routes: Routes = [
  { path: '', redirectTo: '/home', pathMatch: 'full' },
  {
    path: 'welcome',
    component: LoginComponent,
    canActivate: [AngularFireAuthGuard],
    data: { authGuardPipe: redirectLoggedInToHome },
  },
  {
    path: 'home',
    canActivate: [AngularFireAuthGuard, ActiveGuard],
    data: { authGuardPipe: redirectUnauthorizedToLogin },
    canDeactivate: [ActiveGuard],
    children: [
      {
        path: '',
        canActivate: [SyncTracksGuard],
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
