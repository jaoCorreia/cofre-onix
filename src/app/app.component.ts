import { Component, effect, inject } from '@angular/core';
import { Router } from '@angular/router';
import { App } from '@capacitor/app';
import { IonApp, IonRouterOutlet } from '@ionic/angular';
import { AuthService } from './core/auth/auth.service';
import { isNative } from './core/supabase';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  imports: [IonApp, IonRouterOutlet],
})
export class AppComponent {
  private auth = inject(AuthService);
  private router = inject(Router);

  constructor() {
    effect(() => {
      if (this.auth.locked()) void this.router.navigateByUrl('/bloqueado', { replaceUrl: true });
    });
    effect(() => {
      // Depois do login pelo navegador (OAuth), volta ao destino salvo, como um link de convite.
      const next = sessionStorage.getItem('cofre.after_login');
      if (this.auth.signedIn() && next) {
        sessionStorage.removeItem('cofre.after_login');
        void this.router.navigateByUrl(next, { replaceUrl: true });
      }
    });
    effect(() => {
      // Sessão encerrada (logout, token revogado, outro aparelho): volta para o login.
      if (this.auth.ready() && !this.auth.signedIn() && !this.router.url.startsWith('/login')) {
        void this.router.navigateByUrl('/login', { replaceUrl: true });
      }
    });
    if (isNative) {
      void App.addListener('appStateChange', ({ isActive }) => (isActive ? this.auth.onForeground() : this.auth.onBackground()));
    }
  }
}
