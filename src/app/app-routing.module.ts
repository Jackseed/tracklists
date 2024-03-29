import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { HomepageComponent } from './homepage/homepage.component';
import {
  AuthGuard,
  redirectUnauthorizedTo,
  redirectLoggedInTo,
} from '@angular/fire/auth-guard';
import { ActiveGuard } from './auth/guard/active.guard';
import { SyncPlaylistsGuard } from './playlists/+state/guard/sync-playlists.guard';
import { LoginComponent } from './auth/login/login.component';
import { LandingComponent } from './landing/landing.component';

const redirectUnauthorizedToLogin = () => redirectUnauthorizedTo(['']);
const redirectLoggedInToHome = () => redirectLoggedInTo(['home']);

const routes: Routes = [
  {
    path: '',
    component: LandingComponent,
    canActivate: [AuthGuard],
    data: { authGuardPipe: redirectLoggedInToHome },
  },
  {
    path: 'login',
    component: LoginComponent,
    canActivate: [AuthGuard],
    data: { authGuardPipe: redirectLoggedInToHome },
  },
  {
    path: 'home',
    canActivate: [AuthGuard, ActiveGuard],
    data: { authGuardPipe: redirectUnauthorizedToLogin },
    canDeactivate: [ActiveGuard],
    children: [
      {
        path: '',
        canActivate: [SyncPlaylistsGuard],
        canDeactivate: [SyncPlaylistsGuard],
        component: HomepageComponent,
      },
    ],
  },
  {
    path: '**',
    redirectTo: '',
    pathMatch: 'full',
  },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule],
})
export class AppRoutingModule {}
