import { Component, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IonContent } from '@ionic/angular';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-lock',
  imports: [IonContent],
  template: `
    <ion-content>
      <main class="wrap">
        <div class="mark" aria-hidden="true">◆</div>
        <h1>Cofre bloqueado</h1>
        <p>Use sua digital para continuar.</p>
        <button class="primary" (click)="unlock()">Desbloquear</button>
        <button class="ghost" (click)="useGoogle()">Entrar com Google</button>
        @if (message()) { <p class="msg" role="alert">{{ message() }}</p> }
      </main>
    </ion-content>
  `,
  styles: `
    .wrap { min-height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; padding: 24px; text-align: center; }
    .mark { width: 64px; height: 64px; border-radius: 20px; display: grid; place-items: center; background: var(--cofre-surface); color: var(--cofre-gold); font-size: 28px; }
    h1 { font-size: 22px; margin: 6px 0 0; }
    p { color: var(--cofre-muted); margin: 0; }
    button { font: inherit; font-weight: 600; border-radius: 14px; padding: 14px; width: min(320px, 100%); cursor: pointer; }
    .primary { background: var(--cofre-gold); color: var(--cofre-on-gold); border: 0; margin-top: 12px; }
    .ghost { background: none; color: var(--cofre-muted); border: 1px solid var(--cofre-line); }
    .msg { color: var(--cofre-warn); }
  `,
})
export class LockPage implements OnInit {
  private auth = inject(AuthService);
  private router = inject(Router);
  readonly message = signal('');

  ngOnInit(): void {
    // Espera o app terminar de abrir: se a janela da digital surgir durante a abertura,
    // o Android pode cancelá-la sozinho.
    setTimeout(() => void this.unlock(), 400);
  }

  async unlock(): Promise<void> {
    this.message.set('');
    const outcome = await this.auth.unlock();
    switch (outcome) {
      case 'unlocked':
        await this.router.navigateByUrl('/', { replaceUrl: true });
        break;
      case 'retry':
        this.message.set('Digital não reconhecida. Tente de novo.');
        break;
      case 'cancelled':
        this.message.set('Toque em Desbloquear quando quiser continuar.');
        break;
      case 'lockout':
        this.message.set('Muitas tentativas. Desbloqueie o celular com o PIN e tente de novo, ou entre com Google.');
        break;
      case 'require_google':
        await this.router.navigateByUrl('/login', { replaceUrl: true });
        break;
    }
  }

  async useGoogle(): Promise<void> {
    await this.auth.signOut();
    await this.router.navigateByUrl('/login', { replaceUrl: true });
  }
}
