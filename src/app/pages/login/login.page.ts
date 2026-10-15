import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonContent, IonSpinner } from '@ionic/angular';
import { AuthService } from '../../core/auth/auth.service';

type Step = 'login' | 'code' | 'biometric';
const RESEND_SECONDS = 60;

@Component({
  selector: 'app-login',
  imports: [IonContent, IonSpinner, FormsModule],
  template: `
    <ion-content>
      <main class="wrap">
        <div class="brand">
          <!-- Mesmo desenho do ícone do app (porta de cofre) -->
          <svg class="mark" viewBox="0 0 120 120" aria-hidden="true">
            <rect x="22" y="22" width="76" height="76" rx="14" fill="var(--cofre-surface)" stroke="var(--cofre-gold)" stroke-width="5"/>
            <circle cx="60" cy="60" r="20" fill="none" stroke="var(--cofre-gold)" stroke-width="5"/>
            <circle cx="60" cy="60" r="4" fill="var(--cofre-gold)"/>
            <g stroke="var(--cofre-gold)" stroke-width="5" stroke-linecap="round">
              <line x1="60" y1="40" x2="60" y2="46"/><line x1="60" y1="74" x2="60" y2="80"/>
              <line x1="40" y1="60" x2="46" y2="60"/><line x1="74" y1="60" x2="80" y2="60"/>
            </g>
            <rect x="92" y="40" width="6" height="12" rx="2" fill="var(--cofre-gold)"/>
            <rect x="92" y="68" width="6" height="12" rx="2" fill="var(--cofre-gold)"/>
          </svg>
          <h1>Cofre Ônix</h1>
          <p>Dívidas, empréstimos e investimentos num lugar só, com quem você confia.</p>
        </div>

        @switch (step()) {
          @case ('login') {
            <div class="stack">
              <button class="google" (click)="google()" [disabled]="busy()">
                @if (busy() === 'google') { <ion-spinner name="crescent" /> } @else { <span class="g" aria-hidden="true">G</span> }
                Entrar com Google
              </button>

              <div class="or"><span>ou use seu e-mail</span></div>

              <label class="field">E-mail
                <input id="login-email" type="email" inputmode="email" autocomplete="email" [(ngModel)]="email" placeholder="nome@gmail.com" (keyup.enter)="sendCode()" />
              </label>
              <button class="primary" (click)="sendCode()" [disabled]="busy()">
                @if (busy() === 'send') { <ion-spinner name="crescent" /> } Receber código
              </button>
              <p class="hint">Sem senha: enviamos um código de 6 dígitos. Se for seu primeiro acesso, a conta é criada na hora.</p>
            </div>
          }
          @case ('code') {
            <div class="stack">
              <p>Enviamos um código para <b>{{ email }}</b>. Confira também o spam.</p>
              <label class="field">Código
                <input id="login-code" class="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6"
                       [(ngModel)]="code" placeholder="000000" (ngModelChange)="onCode()" />
              </label>
              <button class="primary" (click)="verify()" [disabled]="busy()">
                @if (busy() === 'verify') { <ion-spinner name="crescent" /> } Entrar
              </button>
              <div class="row-actions">
                <button class="link" (click)="back()">Trocar e-mail</button>
                <button class="link" (click)="sendCode()" [disabled]="cooldown() > 0 || busy()">
                  {{ cooldown() > 0 ? 'Reenviar em ' + cooldown() + 's' : 'Reenviar código' }}
                </button>
              </div>
            </div>
          }
          @case ('biometric') {
            <section class="card">
              <h2>Usar digital nas próximas vezes?</h2>
              <p>O app pede sua digital ao abrir e antes de ações sensíveis. Você pode mudar isso depois.</p>
              <button class="primary" (click)="enableBiometric()">Ativar digital</button>
              <button class="ghost" (click)="done()">Agora não</button>
            </section>
          }
        }

        @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
      </main>
    </ion-content>
  `,
  styles: `
    .wrap { min-height: 100%; display: flex; flex-direction: column; justify-content: center; gap: 28px; padding: 24px; max-width: 420px; margin: 0 auto; }
    .brand { display: flex; flex-direction: column; gap: 8px; }
    .mark { width: 60px; height: 60px; }
    h1 { font-size: 28px; margin: 8px 0 0; }
    p { color: var(--cofre-muted); margin: 0; line-height: 1.5; }
    p b { color: var(--cofre-text); }
    .stack { display: flex; flex-direction: column; gap: 12px; }
    button { font: inherit; font-weight: 600; border-radius: 14px; padding: 14px; display: flex; gap: 10px; align-items: center; justify-content: center; width: 100%; cursor: pointer; }
    button:disabled { opacity: .6; }
    .google { background: var(--cofre-text); color: var(--cofre-bg); border: 0; }
    .g { font-weight: 700; color: var(--cofre-gold); }
    .primary { background: var(--cofre-gold); color: var(--cofre-on-gold); border: 0; }
    .ghost { background: none; color: var(--cofre-muted); border: 1px solid var(--cofre-line); }
    .link { background: none; border: 0; color: var(--cofre-gold); padding: 6px; width: auto; font-weight: 500; }
    .row-actions { display: flex; justify-content: space-between; }
    .or { display: flex; align-items: center; gap: 10px; color: var(--cofre-muted); font-size: 13px; }
    .or::before, .or::after { content: ''; flex: 1; height: 1px; background: var(--cofre-line); }
    .code { font-size: 26px !important; letter-spacing: .4em; text-align: center; }
    .hint { font-size: 12px; }
    .card { background: var(--cofre-surface); border: 1px solid var(--cofre-line); border-radius: 18px; padding: 18px; display: flex; flex-direction: column; gap: 12px; }
    .card h2 { font-size: 18px; margin: 0; }
    .error { color: var(--cofre-debt); }
  `,
})
export class LoginPage {
  private auth = inject(AuthService);
  private router = inject(Router);
  readonly busy = signal<false | 'google' | 'send' | 'verify'>(false);
  readonly error = signal('');
  readonly step = signal<Step>('login');
  readonly cooldown = signal(0);
  email = '';
  code = '';
  private timer?: ReturnType<typeof setInterval>;

  async google(): Promise<void> {
    await this.run('google', async () => {
      await this.auth.signInWithGoogle();
      await this.afterSignIn();
    }, (detail) => `Não deu para entrar com o Google. Detalhe: ${detail}`);
  }

  async sendCode(): Promise<void> {
    this.email = this.email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(this.email)) return this.error.set('Digite um e-mail válido.');
    await this.run('send', async () => {
      await this.auth.sendEmailCode(this.email);
      this.code = '';
      this.step.set('code');
      this.startCooldown();
    }, (detail) =>
      /rate|security purposes|seconds/i.test(detail)
        ? 'Muitos pedidos seguidos. Espere um pouco antes de pedir outro código.'
        : `Não deu para enviar o código. Detalhe: ${detail}`);
  }

  onCode(): void {
    this.code = this.code.replace(/\D/g, '').slice(0, 6);
    if (this.code.length === 6) void this.verify();
  }

  async verify(): Promise<void> {
    if (!/^\d{6}$/.test(this.code)) return this.error.set('Digite os 6 dígitos do código.');
    await this.run('verify', async () => {
      await this.auth.verifyEmailCode(this.email, this.code);
      await this.afterSignIn();
    }, () => 'Código inválido ou expirado. Confira os números ou peça outro.');
  }

  back(): void {
    this.step.set('login');
    this.error.set('');
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

  private async afterSignIn(): Promise<void> {
    if (await this.auth.biometryAvailable()) this.step.set('biometric');
    else await this.done();
  }

  private async run(kind: 'google' | 'send' | 'verify', fn: () => Promise<void>, message: (detail: string) => string): Promise<void> {
    this.busy.set(kind);
    this.error.set('');
    try {
      await fn();
    } catch (e) {
      const detail = e instanceof Error ? e.message : JSON.stringify(e);
      this.error.set(message(detail));
      console.error(e);
    } finally {
      this.busy.set(false);
    }
  }

  private startCooldown(): void {
    clearInterval(this.timer);
    this.cooldown.set(RESEND_SECONDS);
    this.timer = setInterval(() => {
      this.cooldown.update((s) => s - 1);
      if (this.cooldown() <= 0) clearInterval(this.timer);
    }, 1000);
  }
}
