import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';
import { AppComponent } from './app.component';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { AppRoutingModule } from './app-routing.module';
import { AuthModule } from './auth/auth.module';
import { HomepageComponent } from './homepage/homepage.component';
import { AngularFireModule } from '@angular/fire';
import { environment } from 'src/environments/environment';
import { AngularFirestoreModule } from '@angular/fire/firestore';
import { AkitaNgDevtools } from '@datorama/akita-ngdevtools';
import { CommonModule } from '@angular/common';
import { TracksModule } from './tracks/tracks.module';
import { MatButtonModule } from '@angular/material/button';
import { PlayerComponent } from './player/player.component';
import { FiltersModule } from './filters/filters.module';
import { FlexLayoutModule } from '@angular/flex-layout';
import { NavbarComponent } from './navbar/navbar.component';

@NgModule({
  declarations: [AppComponent, HomepageComponent, PlayerComponent, NavbarComponent],
  imports: [
    BrowserModule,
    CommonModule,
    BrowserAnimationsModule,
    AppRoutingModule,
    AuthModule,
    TracksModule,
    FiltersModule,
    AngularFireModule.initializeApp(environment.firebaseConfig),
    AngularFirestoreModule,
    AngularFirestoreModule,
    MatButtonModule,
    FlexLayoutModule,
    environment.production ? [] : AkitaNgDevtools.forRoot(),
  ],
  providers: [],
  bootstrap: [AppComponent],
})
export class AppModule {}
