import { enableProdMode } from '@angular/core';
import { platformBrowser } from '@angular/platform-browser';
import { akitaConfig, enableAkitaProdMode } from '@datorama/akita';

import { AppModule } from './app/app.module';
import { environment } from './environments/environment';

if (environment.production) {
  enableProdMode();
  // Without it Akita deep-freezes the whole store on every update: costly with a large library.
  enableAkitaProdMode();
}

akitaConfig({
  resettable: true,
});

platformBrowser()
  .bootstrapModule(AppModule)
  .catch((err) => console.error(err));
