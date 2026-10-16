import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonBackButton, IonButtons, IonContent, IonHeader, IonIcon, IonTitle, IonToolbar, ViewWillEnter } from '@ionic/angular';
import { formatBRL, formatBRLCompact, parseBRL, parsePercent } from '../../../domain/money';
import { suggestIcon } from '../../../domain/icon-catalog';
import { IconPickerComponent } from '../../components/icon-picker.component';
import { AuthService } from '../../core/auth/auth.service';
import { HouseholdService } from '../../core/data/household.service';
import { LoansService } from '../../core/data/loans.service';
import { Loan } from '../../core/data/models';

@Component({
  selector: 'app-loans',
  imports: [IonContent, IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon, FormsModule, IconPickerComponent],
  template: `
    <ion-header><ion-toolbar>
      <ion-buttons slot="start"><ion-back-button defaultHref="/inicio" text="" /></ion-buttons>
      <ion-title>Empréstimos</ion-title>
    </ion-toolbar></ion-header>
    <ion-content>
      <div class="page">
        <div class="tiles" style="grid-template-columns:1fr 1fr">
          <section class="card"><div class="muted">Te devem</div><div class="num loan" style="font-size:20px">{{ compact(receivable()) }}</div></section>
          <section class="card"><div class="muted">Você deve</div><div class="num down" style="font-size:20px">{{ compact(payable()) }}</div></section>
        </div>

        @for (group of groups(); track group.title) {
          @if (group.items.length) {
            <section class="card">
              <h2>{{ group.title }}</h2>
              @for (l of group.items; track l.id) {
                <div class="loan-row">
                  <div class="row" style="border:0;padding-bottom:4px">
                    <div class="l">
                      <div class="dot" [class.loan]="l.direction === 'lent'" [class.down]="l.direction === 'borrowed'"><ion-icon [name]="l.icon || 'person-outline'" aria-hidden="true" /></div>
                      <div>
                        {{ l.counterparty }} @if (l.private) { <span class="pill">privado</span> }
                        <div class="muted">
                          {{ brl(l.paid_cents) }} de {{ brl(l.amount_cents) }}
                          @if (l.due_date) { · vence {{ date(l.due_date) }} }
                          @if (overdue(l)) { <span class="pill warn">atrasado</span> }
                        </div>
                      </div>
                    </div>
                    <span class="num">{{ brl(l.amount_cents - l.paid_cents) }}</span>
                  </div>
                  <div class="bar"><i [style.width.%]="pct(l)" [style.background]="l.direction === 'lent' ? 'var(--cofre-loan)' : 'var(--cofre-debt)'"></i></div>
                  @if (l.notes) { <p class="muted" style="margin:6px 0 0">{{ l.notes }}</p> }
                  @if (household.canEdit() && l.paid_cents < l.amount_cents) {
                    @if (paying() === l.id) {
                      <div class="pay">
                        <input class="field" inputmode="decimal" [(ngModel)]="payValue" placeholder="Valor" [attr.aria-label]="'Valor para ' + l.counterparty" />
                        <button class="btn primary" (click)="pay(l)">Confirmar</button>
                        <button class="btn" (click)="paying.set(null)">Cancelar</button>
                      </div>
                    } @else {
                      <div class="actions">
                        <button class="btn" (click)="startPay(l)">{{ l.direction === 'lent' ? 'Registrar recebimento' : 'Registrar pagamento' }}</button>
                        <button class="btn danger" (click)="remove(l)" aria-label="Apagar"><ion-icon name="trash-outline" /></button>
                      </div>
                    }
                  } @else if (household.canEdit()) {
                    <div class="actions"><span class="pill ok">quitado</span><button class="btn danger" (click)="remove(l)" aria-label="Apagar"><ion-icon name="trash-outline" /></button></div>
                  }
                </div>
              }
            </section>
          }
        }

        @if (!loans.loans().length && !adding()) {
          <section class="card empty">
            <ion-icon name="swap-horizontal-outline" aria-hidden="true" />
            <p class="muted" style="margin:0">Anote quem te deve e para quem você deve. O app lembra os prazos e soma no seu patrimônio.</p>
          </section>
        }

        @if (household.canEdit()) {
          @if (adding()) {
            <section class="card">
              <h2>Novo empréstimo</h2>
              <div class="seg" role="radiogroup" aria-label="Tipo">
                <button type="button" role="radio" [attr.aria-checked]="direction === 'lent'" [class.on]="direction === 'lent'" (click)="direction = 'lent'">
                  <ion-icon name="arrow-up-outline" aria-hidden="true" /> Emprestei
                </button>
                <button type="button" role="radio" [attr.aria-checked]="direction === 'borrowed'" [class.on]="direction === 'borrowed'" (click)="direction = 'borrowed'">
                  <ion-icon name="arrow-down-outline" aria-hidden="true" /> Peguei emprestado
                </button>
              </div>
              <div class="form" style="margin-top:12px">
                <label class="full">{{ direction === 'lent' ? 'Para quem' : 'De quem' }}
                  <input id="l-who" type="text" [(ngModel)]="who" (blur)="autoIcon()" placeholder="Marcos" maxlength="80" />
                </label>
                <label>Valor (R$)<input id="l-val" inputmode="decimal" [(ngModel)]="amount" placeholder="600,00" /></label>
                <label>Juros (% a.m.)<input id="l-rate" inputmode="decimal" [(ngModel)]="rate" placeholder="0" /></label>
                <label class="full">Combinado para<input id="l-due" type="date" [(ngModel)]="due" /></label>
                <label class="full">Observação<input id="l-notes" type="text" [(ngModel)]="notes" maxlength="500" placeholder="6x de R$ 100 no Pix" /></label>
                <label class="full" style="flex-direction:row;align-items:center;gap:8px">
                  <input id="l-priv" type="checkbox" [(ngModel)]="isPrivate" style="width:auto" /> Privado (só eu vejo)
                </label>
              </div>
              <div style="margin-top:12px"><app-icon-picker [(value)]="icon" [hint]="who" [preferred]="['person-outline','people-outline','cash-outline','business-outline']" /></div>
              @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
              <div class="actions" style="margin-top:12px">
                <button class="btn primary" (click)="save()" [disabled]="busy()">Salvar</button>
                <button class="btn" (click)="adding.set(false)">Cancelar</button>
              </div>
            </section>
          } @else {
            <button class="btn primary block" (click)="adding.set(true)"><ion-icon name="add-outline" aria-hidden="true" /> Novo empréstimo</button>
          }
        }
        @if (error() && !adding()) { <p class="error" role="alert">{{ error() }}</p> }
      </div>
    </ion-content>
  `,
  styles: `
    .loan-row { padding: 10px 0; border-bottom: 1px solid var(--cofre-line); }
    .loan-row:last-child { border-bottom: 0; }
    .actions { display: flex; gap: 8px; align-items: center; margin-top: 10px; }
    .actions .btn { padding: 8px 12px; }
    .pay { display: flex; gap: 8px; margin-top: 10px; }
    .pay input { flex: 1; min-width: 0; }
    .pay .btn { padding: 8px 12px; }
    .seg { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .seg button { font: inherit; font-size: 13px; padding: 10px; border-radius: 12px; border: 1px solid var(--cofre-line); background: var(--cofre-surface-2); color: var(--cofre-text); display: flex; gap: 6px; justify-content: center; align-items: center; cursor: pointer; }
    .seg button.on { border-color: var(--cofre-gold); color: var(--cofre-gold); }
  `,
})
export class LoansPage implements ViewWillEnter {
  readonly loans = inject(LoansService);
  readonly household = inject(HouseholdService);
  private auth = inject(AuthService);
  readonly brl = formatBRL;
  readonly compact = formatBRLCompact;

  readonly adding = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly paying = signal<string | null>(null);
  payValue = '';

  direction: 'lent' | 'borrowed' = 'lent';
  who = '';
  amount = '';
  rate = '';
  due = '';
  notes = '';
  icon = 'person-outline';
  isPrivate = false;

  private open = (l: Loan) => Math.max(0, l.amount_cents - l.paid_cents);
  readonly receivable = computed(() => this.loans.loans().filter((l) => l.direction === 'lent').reduce((s, l) => s + this.open(l), 0));
  readonly payable = computed(() => this.loans.loans().filter((l) => l.direction === 'borrowed').reduce((s, l) => s + this.open(l), 0));
  readonly groups = computed(() => [
    { title: 'Te devem', items: this.loans.loans().filter((l) => l.direction === 'lent') },
    { title: 'Você deve', items: this.loans.loans().filter((l) => l.direction === 'borrowed') },
  ]);

  ionViewWillEnter(): void {
    void this.loans.load().catch(() => this.error.set('Não deu para carregar os empréstimos.'));
  }

  pct(l: Loan): number {
    return l.amount_cents ? Math.round((l.paid_cents / l.amount_cents) * 100) : 0;
  }

  overdue(l: Loan): boolean {
    return !!l.due_date && l.paid_cents < l.amount_cents && l.due_date < new Date().toISOString().slice(0, 10);
  }

  date(iso: string): string {
    return new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR');
  }

  autoIcon(): void {
    const s = suggestIcon(this.who);
    if (s && this.icon === 'person-outline') this.icon = s;
  }

  startPay(l: Loan): void {
    this.payValue = formatBRL(this.open(l)).replace('R$ ', '');
    this.paying.set(l.id);
  }

  async pay(l: Loan): Promise<void> {
    const cents = parseBRL(this.payValue);
    if (!cents || cents <= 0) return this.error.set('Informe um valor válido.');
    this.error.set('');
    try {
      await this.loans.registerPayment(l.id, cents);
      this.paying.set(null);
    } catch {
      this.error.set('Não deu para registrar.');
    }
  }

  async save(): Promise<void> {
    const amountCents = parseBRL(this.amount);
    const monthlyRate = this.rate.trim() ? parsePercent(this.rate) : 0;
    if (!this.who.trim()) return this.error.set('Informe a pessoa.');
    if (!amountCents || amountCents <= 0) return this.error.set('Informe o valor.');
    if (monthlyRate === null) return this.error.set('Juros inválidos.');
    this.error.set('');
    this.busy.set(true);
    try {
      await this.loans.create({
        counterparty: this.who.trim(), direction: this.direction, amountCents, monthlyRate,
        dueDate: this.due || null, icon: this.icon, notes: this.notes.trim(), private: this.isPrivate,
      });
      this.adding.set(false);
      this.who = this.amount = this.rate = this.due = this.notes = '';
      this.icon = 'person-outline';
    } catch {
      this.error.set('Não deu para salvar.');
    } finally {
      this.busy.set(false);
    }
  }

  async remove(l: Loan): Promise<void> {
    if (!(await this.auth.confirmSensitive('Confirme para apagar o empréstimo'))) return;
    try {
      await this.loans.remove(l.id);
    } catch {
      this.error.set('Não deu para apagar.');
    }
  }
}
