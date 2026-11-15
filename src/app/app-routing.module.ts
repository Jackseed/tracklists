import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { redirectLoggedInToHome, requireLogin, startSession } from './auth/guard/auth.guards';
import { LoginComponent } from './auth/login/login.component';
import { HomepageComponent } from './homepage/homepage.component';
import { LandingComponent } from './landing/landing.component';

const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    component: LandingComponent,
    canActivate: [redirectLoggedInToHome],
  },
  {
    path: 'login',
    component: LoginComponent,
    canActivate: [redirectLoggedInToHome],
  },
  {
    path: 'home',
    component: HomepageComponent,
    canActivate: [requireLogin, startSession],
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
