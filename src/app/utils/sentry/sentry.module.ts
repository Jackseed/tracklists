import { ErrorHandler, NgModule, inject, provideAppInitializer } from '@angular/core';
import * as Sentry from '@sentry/angular';
import { environment } from '../../../environments/environment';
import { AUTH, authState } from '../../core/firebase';

// Without a DSN (development, staging) nothing is sent.
Sentry.init({
  dsn: environment.sentry.dsn,
  enabled: !!environment.sentry.dsn,
  environment: environment.production ? 'prod' : 'dev',
});

@NgModule({
  providers: [
    { provide: ErrorHandler, useValue: Sentry.createErrorHandler({ logErrors: !environment.production }) },
    // Attaches the signed-in user to the error reports.
    provideAppInitializer(() => {
      authState(inject(AUTH)).subscribe((user) => Sentry.setUser(user ? { id: user.uid, email: user.email ?? undefined } : null));
    }),
  ],
})
export class SentryModule {}
