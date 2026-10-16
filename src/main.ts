import { inject, provideAppInitializer } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { RouteReuseStrategy, provideRouter, withComponentInputBinding, withHashLocation, withPreloading, PreloadAllModules } from '@angular/router';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular';

import { routes } from './app/app.routes';
import { AppComponent } from './app/app.component';
import { AuthService } from './app/core/auth/auth.service';

bootstrapApplication(AppComponent, {
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular(),
    // Rotas com # para a versão web funcionar em hospedagem estática (GitHub Pages) sem reescrita de URL.
    provideRouter(routes, withPreloading(PreloadAllModules), withComponentInputBinding(), withHashLocation()),
    // A sessão é carregada antes da primeira rota, para os guards decidirem certo.
    provideAppInitializer(() => inject(AuthService).init()),
  ],
});
