import { ErrorHandler, Injectable, NgModule } from '@angular/core';
import { environment } from '../../../environments/environment';
import * as Sentry from '@sentry/browser';
import { Auth, user } from '@angular/fire/auth';

@Injectable()
export class SentryErrorHandler implements ErrorHandler {
  constructor(private auth: Auth) {
    user(auth).subscribe((user) => {
      if (!user) {
        return;
      }

      Sentry.configureScope((scope) => {
        scope.setUser({
          email: user.email,
          id: user.uid,
        });
      });
    });
  }
  handleError(error) {
    if (!environment.production) console.error(error);
    Sentry.captureException(error.originalError || error);
  }
}

// Init and add the Sentry ErrorHandler.
Sentry.init({
  dsn: environment.sentry.dsn,
  environment: environment.production ? 'prod' : 'dev',
});

@NgModule({
  providers: [{ provide: ErrorHandler, useClass: SentryErrorHandler }],
})
export class SentryModule {}

