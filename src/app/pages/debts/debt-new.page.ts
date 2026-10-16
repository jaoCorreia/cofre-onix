import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonBackButton, IonButtons, IonContent, IonHeader, IonTitle, IonToolbar } from '@ionic/angular';
import { AmortizationSystem, schedule, totalInterest } from '../../../domain/amortization';
import { formatBRL, parseBRL, parsePercent } from '../../../domain/money';
import { DebtsService } from '../../core/data/debts.service';
import { DEBT_ICONS } from '../../core/icons';
import { IconPickerComponent } from '../../components/icon-picker.component';
import { suggestIcon } from '../../../domain/icon-catalog';

@Component({
  selector: 'app-debt-new',
  imports: [IonContent, IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, FormsModule, IconPickerComponent],
  template: `
    <ion-header><ion-toolbar>
      <ion-buttons slot="start"><ion-back-button defaultHref="/dividas" text="" /></ion-buttons>
      <ion-title>Nova dívida</ion-title>
    </ion-toolbar></ion-header>
    <ion-content>
      <div class="page">
        <section class="card form">
          <label class="full">Nome<input id="d-name" type="text" [(ngModel)]="name" (blur)="autoIcon()" placeholder="Financiamento do carro" maxlength="120" /></label>
          <label class="full">Credor<input id="d-cred" type="text" [(ngModel)]="creditor" placeholder="Banco" /></label>
          <label>Valor financiado (R$)<input id="d-val" inputmode="decimal" [(ngModel)]="principal" (ngModelChange)="touch()" placeholder="38.000,00" /></label>
          <label>Juros (% a.m.)<input id="d-rate" inputmode="decimal" [(ngModel)]="rate" (ngModelChange)="touch()" placeholder="2,1" /></label>
          <label>Parcelas<input id="d-n" inputmode="numeric" [(ngModel)]="n" (ngModelChange)="touch()" placeholder="48" /></label>
          <label>Já pagas<input id="d-paid" inputmode="numeric" [(ngModel)]="paid" (ngModelChange)="touch()" placeholder="0" /></label>
          <label>Sistema
            <select id="d-sys" [(ngModel)]="system" (ngModelChange)="touch()">
              <option value="price">Price (parcela fixa)</option>
              <option value="sac">SAC (parcela cai)</option>
            </select>
          </label>
          <label>1º vencimento<input id="d-due" type="date" [(ngModel)]="firstDue" /></label>
          <label class="full" style="flex-direction:row;align-items:center;gap:8px">
            <input id="d-priv" type="checkbox" [(ngModel)]="isPrivate" style="width:auto" /> Privada (só eu vejo)
          </label>
        </section>

        <section class="card"><app-icon-picker [(value)]="icon" [hint]="name + ' ' + creditor" [preferred]="icons" /></section>

        @if (preview(); as p) {
          <section class="card">
            <div class="row"><span class="muted">{{ system === 'sac' ? 'Primeira parcela' : 'Parcela' }}</span><span class="num">{{ brl(p.payment) }}</span></div>
            <div class="row"><span class="muted">Juros totais</span><span class="num down">{{ brl(p.interest) }}</span></div>
            <div class="row"><span class="muted">Total pago</span><span class="num">{{ brl(p.total) }}</span></div>
          </section>
        }

        @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
        <button class="btn primary block" (click)="save()" [disabled]="busy()">Salvar e gerar parcelas</button>
      </div>
    </ion-content>
  `,
})
export class DebtNewPage {
  private debts = inject(DebtsService);
  private router = inject(Router);
  readonly brl = formatBRL;
  readonly icons = DEBT_ICONS;

  icon = DEBT_ICONS[0];
  name = '';
  creditor = '';
  principal = '';
  rate = '';
  n = '';
  paid = '0';
  system: AmortizationSystem = 'price';
  firstDue = new Date().toISOString().slice(0, 10);
  isPrivate = false;

  readonly busy = signal(false);
  readonly error = signal('');
  private version = signal(0);

  /** Ao sair do campo nome, sugere um ícone se o usuário ainda não escolheu outro. */
  autoIcon(): void {
    const s = suggestIcon(`${this.name} ${this.creditor}`);
    if (s && this.icon === DEBT_ICONS[0]) this.icon = s;
  }

  touch(): void {
    this.version.update((v) => v + 1);
  }

  private parsed() {
    const principalCents = parseBRL(this.principal);
    const monthlyRate = parsePercent(this.rate);
    const installments = Number(this.n);
    const alreadyPaid = Number(this.paid || 0);
    if (!principalCents || principalCents <= 0) return 'Informe o valor financiado.';
    if (monthlyRate === null || monthlyRate > 1) return 'Informe os juros ao mês, por exemplo 2,1.';
    if (!Number.isInteger(installments) || installments < 1 || installments > 600) return 'Parcelas entre 1 e 600.';
    if (!Number.isInteger(alreadyPaid) || alreadyPaid < 0 || alreadyPaid >= installments) return 'Parcelas já pagas devem ser menos que o total.';
    return { principalCents, monthlyRate, installments, alreadyPaid };
  }

  readonly preview = computed(() => {
    this.version();
    const p = this.parsed();
    if (typeof p === 'string') return null;
    const rows = schedule(this.system, p.principalCents, p.monthlyRate, p.installments);
    const interest = totalInterest(rows);
    return { payment: rows[0].payment, interest, total: p.principalCents + interest };
  });

  async save(): Promise<void> {
    const p = this.parsed();
    if (!this.name.trim()) return this.error.set('Dê um nome à dívida.');
    if (typeof p === 'string') return this.error.set(p);
    if (!this.firstDue) return this.error.set('Informe o 1º vencimento.');
    this.error.set('');
    this.busy.set(true);
    try {
      const id = await this.debts.create({
        ...p,
        name: this.name.trim(),
        creditor: this.creditor.trim(),
        icon: this.icon,
        system: this.system,
        firstDue: this.firstDue,
        private: this.isPrivate,
      });
      await this.router.navigateByUrl(`/dividas/${id}`, { replaceUrl: true });
    } catch (e) {
      console.error(e);
      this.error.set('Não deu para salvar. Confira sua conexão e tente de novo.');
    } finally {
      this.busy.set(false);
    }
  }
}
