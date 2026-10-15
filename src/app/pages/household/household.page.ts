import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonContent, IonHeader, IonIcon, IonTitle, IonToggle, IonToolbar, ViewWillEnter } from '@ionic/angular';
import { AuthService } from '../../core/auth/auth.service';
import { HouseholdService } from '../../core/data/household.service';
import { Member, Role } from '../../core/data/models';

const ROLE_LABEL: Record<Role, string> = { owner: 'Dono', editor: 'Editor', viewer: 'Leitor' };

@Component({
  selector: 'app-household',
  imports: [IonContent, IonHeader, IonToolbar, IonTitle, IonIcon, IonToggle, FormsModule],
  template: `
    <ion-header><ion-toolbar><ion-title>{{ household.current()?.name }}</ion-title></ion-toolbar></ion-header>
    <ion-content>
      <div class="page">
        <section class="card">
          <h2>Pessoas</h2>
          @for (m of members(); track m.user_id) {
            <div class="row">
              <div class="l"><div class="dot gold"><ion-icon name="people-outline" aria-hidden="true" /></div>
                <div>{{ m.email ?? 'Membro' }}<div class="muted">{{ label[m.role] }}</div></div></div>
              @if (household.isOwner() && m.role !== 'owner') {
                <button class="btn danger" style="padding:6px 10px" (click)="remove(m)">Remover</button>
              }
            </div>
          }
        </section>

        @if (household.isOwner()) {
          <section class="card">
            <h2>Convidar alguém</h2>
            <p class="muted" style="margin:0 0 10px">A pessoa entra com a própria conta Google. O link vale por 48 horas e só para este e-mail.</p>
            <div class="form">
              <label class="full">E-mail<input id="inv-email" type="email" [(ngModel)]="email" placeholder="nome@gmail.com" autocomplete="off" /></label>
              <label class="full">Pode
                <select id="inv-role" [(ngModel)]="role">
                  <option value="editor">Ver e lançar (editor)</option>
                  <option value="viewer">Só acompanhar (leitor)</option>
                </select>
              </label>
            </div>
            <button class="btn primary block" style="margin-top:12px" (click)="invite()" [disabled]="busy()">Gerar convite</button>
            @if (link()) {
              <div class="card" style="margin-top:12px;background:var(--cofre-surface-2)">
                <div class="muted">Envie este link para {{ sentTo() }}:</div>
                <div class="num" style="word-break:break-all;font-size:12px;margin:6px 0">{{ link() }}</div>
                <button class="btn" (click)="copy()"><ion-icon name="copy-outline" aria-hidden="true" /> {{ copied() ? 'Copiado' : 'Copiar link' }}</button>
              </div>
            }
          </section>
        }

        <section class="card">
          <h2>Segurança</h2>
          @if (biometryAvailable()) {
            <div class="row">
              <div class="l"><div class="dot gold"><ion-icon name="finger-print-outline" aria-hidden="true" /></div><div>Desbloquear com digital</div></div>
              <ion-toggle [checked]="auth.biometricEnabled" (ionChange)="toggleBiometric($event)" aria-label="Desbloquear com digital" />
            </div>
          }
          <button class="btn block" style="margin-top:8px" (click)="signOut()"><ion-icon name="log-out-outline" aria-hidden="true" /> Sair</button>
        </section>
        @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
      </div>
    </ion-content>
  `,
})
export class HouseholdPage implements ViewWillEnter {
  readonly household = inject(HouseholdService);
  readonly auth = inject(AuthService);
  private router = inject(Router);
  readonly label = ROLE_LABEL;

  readonly members = signal<Member[]>([]);
  readonly biometryAvailable = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly link = signal('');
  readonly sentTo = signal('');
  readonly copied = signal(false);
  email = '';
  role: Exclude<Role, 'owner'> = 'editor';

  async ionViewWillEnter(): Promise<void> {
    this.biometryAvailable.set(await this.auth.biometryAvailable());
    this.members.set(await this.household.members());
  }

  async invite(): Promise<void> {
    const email = this.email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return this.error.set('Digite um e-mail válido.');
    if (!(await this.auth.confirmSensitive('Confirme para convidar alguém'))) return;
    this.error.set('');
    this.busy.set(true);
    try {
      this.link.set(await this.household.invite(email, this.role));
      this.sentTo.set(email);
      this.copied.set(false);
      this.email = '';
    } catch (e) {
      console.error(e);
      this.error.set('Não deu para gerar o convite.');
    } finally {
      this.busy.set(false);
    }
  }

  async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.link());
      this.copied.set(true);
    } catch {
      this.error.set('Não deu para copiar. Selecione o link e copie manualmente.');
    }
  }

  async remove(m: Member): Promise<void> {
    if (!(await this.auth.confirmSensitive('Confirme para remover a pessoa'))) return;
    try {
      await this.household.removeMember(m.user_id);
      this.members.set(await this.household.members());
    } catch (e) {
      console.error(e);
      this.error.set('Não deu para remover.');
    }
  }

  async toggleBiometric(ev: CustomEvent): Promise<void> {
    const on = (ev.detail as { checked: boolean }).checked;
    if (on && !(await this.auth.enableBiometric())) (ev.target as HTMLIonToggleElement).checked = false;
    if (!on) await this.auth.disableBiometric();
  }

  async signOut(): Promise<void> {
    await this.auth.signOut();
    this.household.clear();
    await this.router.navigateByUrl('/login', { replaceUrl: true });
  }
}
