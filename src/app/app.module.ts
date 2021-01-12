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
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatSliderModule } from '@angular/material/slider';
import { SecToMinPipe } from './utils/sec-to-min.pipe';
import { FormsModule } from '@angular/forms';
import { PlaylistsModule } from './playlists/playlists.module';
import { MatTabsModule } from '@angular/material/tabs';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

@NgModule({
  declarations: [
    AppComponent,
    HomepageComponent,
    PlayerComponent,
    SecToMinPipe,
  ],
  imports: [
    BrowserModule,
    CommonModule,
    BrowserAnimationsModule,
    AppRoutingModule,
    AuthModule,
    TracksModule,
    FiltersModule,
    PlaylistsModule,
    AngularFireModule.initializeApp(environment.firebaseConfig),
    AngularFirestoreModule,
    AngularFirestoreModule,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    FormsModule,
    FlexLayoutModule,
    MatSliderModule,
    MatTabsModule,
    MatDividerModule,
    MatProgressSpinnerModule,
    //environment.production ? [] : AkitaNgDevtools.forRoot(),
  ],
  providers: [],
  bootstrap: [AppComponent],
})
export class AppModule {}
