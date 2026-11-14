// Angular
import { BrowserModule } from '@angular/platform-browser';
import { NgModule, provideZoneChangeDetection } from '@angular/core';
import { CommonModule } from '@angular/common';
import { provideHttpClient } from '@angular/common/http';
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
import { SentryModule } from './utils/sentry/sentry.module';
// Components
import { AppComponent } from './app.component';
import { HomepageComponent } from './homepage/homepage.component';
import { PlayerComponent } from './player/player.component';
import { LandingComponent } from './landing/landing.component';
// Material
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSliderModule } from '@angular/material/slider';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
// Flex layout
import { FlexLayoutModule } from '@ngbracket/ngx-layout';
// Pipes
import { SecToMinPipe } from './utils/sec-to-min.pipe';
import { LoopWhileDirective } from './utils/loop-while.directive';

@NgModule({
  declarations: [AppComponent, HomepageComponent, PlayerComponent, SecToMinPipe, LandingComponent, LoopWhileDirective],
  imports: [
    BrowserModule,
    CommonModule,
    ServiceWorkerModule.register('ngsw-worker.js', {
      enabled: environment.production,
      // Register the ServiceWorker as soon as the app is stable
      // or after 30 seconds (whichever comes first).
      registrationStrategy: 'registerWhenStable:30000',
    }),
    AppRoutingModule,
    SentryModule,
    AuthModule,
    TracksModule,
    FiltersModule,
    PlaylistsModule,
    MatButtonModule,
    MatDialogModule,
    MatIconModule,
    MatSnackBarModule,
    FormsModule,
    FlexLayoutModule,
    MatSliderModule,
    MatTabsModule,
    MatDividerModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
  providers: [
    // The app relies on zone.js to detect changes (timers, Firebase and Spotify callbacks).
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideHttpClient(),
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}
