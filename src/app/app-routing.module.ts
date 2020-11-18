import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { LoginComponent } from './auth/login/login.component';
import { HomepageComponent } from './homepage/homepage.component';
import {
  AngularFireAuthGuard,
  redirectUnauthorizedTo
} from "@angular/fire/auth-guard";
import { ActiveGuard } from './auth/guard/active.guard';

const redirectUnauthorizedToLogin = () => redirectUnauthorizedTo(["welcome"]);

const routes: Routes = [
  { path: '', redirectTo: '/welcome', pathMatch: 'full' },
  { path: 'welcome', component: LoginComponent },
  {
    path: "home",
    canActivate: [AngularFireAuthGuard, ActiveGuard],
    data: { authGuardPipe: redirectUnauthorizedToLogin, animation: "homePage" },
    canDeactivate: [ActiveGuard],
    component: HomepageComponent
  },
];


@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
