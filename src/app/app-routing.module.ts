import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { HomepageComponent } from './homepage/homepage.component';
import { ActiveGuard } from './auth/guard/active.guard';
import { SyncPlaylistsGuard } from './playlists/+state/guard/sync-playlists.guard';

const routes: Routes = [
  {
    path: '',
    //canActivate: [ActiveGuard],
    //canDeactivate: [ActiveGuard],
    children: [
      {
        path: '',
        //canActivate: [SyncPlaylistsGuard],
        //canDeactivate: [SyncPlaylistsGuard],
        component: HomepageComponent,
      },
    ],
  },
  {
    path: '**',
    redirectTo: '/home',
    pathMatch: 'full',
  },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule],
})
export class AppRoutingModule {}
