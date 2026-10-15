import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IonContent, IonSpinner } from '@ionic/angular';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-login',
  imports: [IonContent, IonSpinner],
  template: `
    <ion-content>
      <main class="wrap">
        <div class="brand">
          <div class="mark" aria-hidden="true">◆</div>
          <h1>Cofre Ônix</h1>
          <p>Dívidas, empréstimos e investimentos num lugar só, com quem você confia.</p>
        </div>

        @if (step() === 'login') {
          <button class="google" (click)="google()" [disabled]="busy()">
            @if (busy()) { <ion-spinner name="crescent" /> } @else { <span class="g" aria-hidden="true">G</span> }
            Entrar com Google
          </button>
        } @else {
          <section class="card">
            <h2>Usar digital nas próximas vezes?</h2>
            <p>O app pede sua digital ao abrir e antes de ações sensíveis. Você pode mudar isso depois.</p>
            <button class="primary" (click)="enableBiometric()">Ativar digital</button>
            <button class="ghost" (click)="done()">Agora não</button>
          </section>
        }

        @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
      </main>
    </ion-content>
  `,
  styles: `
    .wrap { min-height: 100%; display: flex; flex-direction: column; justify-content: center; gap: 32px; padding: 24px; max-width: 420px; margin: 0 auto; }
    .brand { display: flex; flex-direction: column; gap: 8px; }
    .mark { width: 52px; height: 52px; border-radius: 16px; display: grid; place-items: center; background: var(--cofre-surface); color: var(--cofre-gold); font-size: 24px; }
    h1 { font-size: 28px; margin: 8px 0 0; }
    p { color: var(--cofre-muted); margin: 0; line-height: 1.5; }
    button { font: inherit; font-weight: 600; border-radius: 14px; padding: 14px; display: flex; gap: 10px; align-items: center; justify-content: center; width: 100%; cursor: pointer; }
    .google { background: var(--cofre-text); color: var(--cofre-bg); border: 0; }
    .g { font-weight: 700; color: var(--cofre-gold); }
    .card { background: var(--cofre-surface); border: 1px solid var(--cofre-line); border-radius: 18px; padding: 18px; display: flex; flex-direction: column; gap: 12px; }
    .card h2 { font-size: 18px; margin: 0; }
    .primary { background: var(--cofre-gold); color: var(--cofre-on-gold); border: 0; }
    .ghost { background: none; color: var(--cofre-muted); border: 1px solid var(--cofre-line); }
    .error { color: var(--cofre-debt); }
  `,
})
export class LoginPage {
  private auth = inject(AuthService);
  private router = inject(Router);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly step = signal<'login' | 'biometric'>('login');

  async google(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      await this.auth.signInWithGoogle();
      if (await this.auth.biometryAvailable()) this.step.set('biometric');
      else await this.done();
    } catch (e) {
      // Mostra o motivo real: ajuda a diagnosticar configuração do Google/Supabase.
      const detail = e instanceof Error ? e.message : JSON.stringify(e);
      this.error.set(`Não deu para entrar com o Google. Detalhe: ${detail}`);
      console.error(e);
    } finally {
      this.busy.set(false);
    }
  }

  async enableBiometric(): Promise<void> {
    if (!(await this.auth.enableBiometric())) this.error.set('A digital não foi confirmada. Você pode ativar depois.');
    await this.done();
  }

  async done(): Promise<void> {
    const next = sessionStorage.getItem('cofre.after_login') ?? '/';
    sessionStorage.removeItem('cofre.after_login');
    await this.router.navigateByUrl(next, { replaceUrl: true });
  }
}
