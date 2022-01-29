// Angular
import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ServiceWorkerModule } from '@angular/service-worker';
// Env
import { environment } from '../environments/environment';
// Modules
import { AppRoutingModule } from './app-routing.module';
import { AuthModule } from './auth/auth.module';
import { TracksModule } from './tracks/tracks.module';
import { FiltersModule } from './filters/filters.module';
import { PlaylistsModule } from './playlists/playlists.module';
// Components
import { AppComponent } from './app.component';
import { HomepageComponent } from './homepage/homepage.component';
import { PlayerComponent } from './player/player.component';
import { LandingComponent } from './landing/landing.component';
// Angularfire
import { initializeApp, provideFirebaseApp } from '@angular/fire/app';
import {
  connectFirestoreEmulator,
  getFirestore,
  provideFirestore,
} from '@angular/fire/firestore';
import { provideFunctions } from '@angular/fire/functions';
import { getPerformance, providePerformance } from '@angular/fire/performance';
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';
import { provideAuth } from '@angular/fire/auth';
import { connectAuthEmulator, getAuth } from 'firebase/auth';

// Akita
import { AkitaNgDevtools } from '@datorama/akita-ngdevtools';
// Material
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatSliderModule } from '@angular/material/slider';
import { MatTabsModule } from '@angular/material/tabs';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
// Flex layout
import { FlexLayoutModule } from '@angular/flex-layout';
// Pipes
import { SecToMinPipe } from './utils/sec-to-min.pipe';

@NgModule({
  declarations: [
    AppComponent,
    HomepageComponent,
    PlayerComponent,
    SecToMinPipe,
    LandingComponent,
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
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    FormsModule,
    FlexLayoutModule,
    MatSliderModule,
    MatTabsModule,
    MatDividerModule,
    MatProgressSpinnerModule,
    MatProgressBarModule,
    MatTooltipModule,
    ServiceWorkerModule.register('ngsw-worker.js', {
      enabled: environment.production,
      // Register the ServiceWorker as soon as the app is stable
      // or after 30 seconds (whichever comes first).
      registrationStrategy: 'registerWhenStable:30000',
    }),
    provideFirebaseApp(() => initializeApp(environment.firebaseConfig)),
    provideFirestore(() => {
      const firestore = getFirestore();
      //connectFirestoreEmulator(firestore, 'localhost', 8080);
      return firestore;
    }),

    provideFunctions(() => {
      const functions = getFunctions();
      //connectFunctionsEmulator(functions, 'localhost', 5001);
      return functions;
    }),
    provideAuth(() => {
      const auth = getAuth();
      //connectAuthEmulator(auth, 'http://localhost:9099');
      return auth;
    }),
    providePerformance(() => getPerformance()),
    // environment.production ? [] : AkitaNgDevtools.forRoot(),
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}
