import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonBackButton, IonButtons, IonContent, IonHeader, IonIcon, IonTitle, IonToolbar, ViewWillEnter } from '@ionic/angular';
import { countsInMonth, INCOME_CATEGORIES, IncomeCategory } from '../../../domain/income';
import { formatBRL, formatPercent, parseBRL } from '../../../domain/money';
import { AuthService } from '../../core/auth/auth.service';
import { FinanceService } from '../../core/data/finance.service';
import { HouseholdService } from '../../core/data/household.service';
import { IncomesService } from '../../core/data/incomes.service';
import { Income } from '../../core/data/models';

const today = () => new Date().toISOString().slice(0, 10);
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

@Component({
  selector: 'app-incomes',
  imports: [IonContent, IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon, FormsModule],
  template: `
    <ion-header><ion-toolbar>
      <ion-buttons slot="start"><ion-back-button defaultHref="/inicio" text="" /></ion-buttons>
      <ion-title>Receitas</ion-title>
    </ion-toolbar></ion-header>
    <ion-content>
      <div class="page">
        <section class="card">
          <div class="month-nav">
            <button class="btn" (click)="shift(-1)" aria-label="Mês anterior"><ion-icon name="arrow-back-outline" /></button>
            <b>{{ monthLabel() }}</b>
            <button class="btn" (click)="shift(1)" aria-label="Próximo mês"><ion-icon name="arrow-forward-outline" /></button>
          </div>
          <div class="muted">Recebido no mês</div>
          <div class="big up">{{ brl(totals().total) }}</div>
          <div class="row"><span class="muted">Renda regular</span><span class="num">{{ brl(totals().regular) }}</span></div>
          <div class="row"><span class="muted">Dinheiro extra (13º, férias, restituição…)</span><span class="num gold">{{ brl(totals().extra) }}</span></div>
          @if (isCurrentMonth() && finance.commitment() !== null) {
            <div class="row">
              <span class="muted">Comprometido com parcelas</span>
              <span class="pill" [class.ok]="finance.commitmentLevel() === 'ok'" [class.warn]="finance.commitmentLevel() !== 'ok'">{{ pct(finance.commitment()!) }}</span>
            </div>
          }
        </section>

        @if (monthItems().length) {
          <section class="card">
            @for (i of monthItems(); track i.id) {
              <div class="row">
                <div class="l">
                  <div class="dot up"><ion-icon [name]="i.icon || cat(i.category).icon" aria-hidden="true" /></div>
                  <div>
                    {{ i.description }}
                    @if (i.recurring) { <span class="pill">todo mês</span> }
                    @if (i.private) { <span class="pill">privada</span> }
                    <div class="muted">{{ cat(i.category).label }} · {{ date(i.received_on) }}{{ i.ended_on ? ' · até ' + date(i.ended_on) : '' }}</div>
                  </div>
                </div>
                <span class="num up">{{ brl(i.amount_cents) }}</span>
              </div>
              @if (household.canEdit()) {
                <div class="actions">
                  @if (i.recurring && !i.ended_on) { <button class="btn" (click)="end(i)">Parou de receber</button> }
                  <button class="btn danger" (click)="remove(i)" aria-label="Apagar"><ion-icon name="trash-outline" /></button>
                </div>
              }
            }
          </section>
        } @else if (!adding()) {
          <section class="card empty">
            <ion-icon name="wallet-outline" aria-hidden="true" />
            <p class="muted" style="margin:0">Registre quanto você recebe. O app calcula quanto da renda vai para parcelas e avisa quando sobra dinheiro extra para amortizar.</p>
          </section>
        }

        @if (household.canEdit()) {
          @if (adding()) {
            <section class="card">
              <h2>Recebi</h2>
              <div class="form">
                <label class="full">Tipo
                  <select id="r-cat" [(ngModel)]="category" (ngModelChange)="onCategory()">
                    @for (c of categories; track c[0]) { <option [value]="c[0]">{{ c[1].label }}</option> }
                  </select>
                </label>
                <label class="full">Descrição<input id="r-desc" type="text" [(ngModel)]="description" maxlength="120" placeholder="Salário empresa X" /></label>
                <label>Valor (R$)<input id="r-val" inputmode="decimal" [(ngModel)]="amount" placeholder="5.000,00" /></label>
                <label>Recebido em<input id="r-date" type="date" [(ngModel)]="receivedOn" /></label>
                <label class="full" style="flex-direction:row;align-items:center;gap:8px">
                  <input id="r-rec" type="checkbox" [(ngModel)]="recurring" style="width:auto" /> Recebo todo mês
                </label>
                <label class="full" style="flex-direction:row;align-items:center;gap:8px">
                  <input id="r-priv" type="checkbox" [(ngModel)]="isPrivate" style="width:auto" /> Privada (só eu vejo)
                </label>
              </div>
              @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
              <div class="actions">
                <button class="btn primary" (click)="save()" [disabled]="busy()">Salvar</button>
                <button class="btn" (click)="adding.set(false)">Cancelar</button>
              </div>
            </section>
          } @else {
            <button class="btn primary block" (click)="startAdd()"><ion-icon name="add-outline" aria-hidden="true" /> Registrar recebimento</button>
          }
        }
        @if (error() && !adding()) { <p class="error" role="alert">{{ error() }}</p> }
      </div>
    </ion-content>
  `,
  styles: `
    .month-nav { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
    .month-nav .btn { padding: 6px 10px; }
    .month-nav b { text-transform: capitalize; }
    .actions { display: flex; gap: 8px; justify-content: flex-end; padding-bottom: 8px; border-bottom: 1px solid var(--cofre-line); }
    .actions:last-child { border-bottom: 0; }
    .actions .btn { padding: 6px 10px; }
  `,
})
export class IncomesPage implements ViewWillEnter {
  readonly incomes = inject(IncomesService);
  readonly finance = inject(FinanceService);
  readonly household = inject(HouseholdService);
  private auth = inject(AuthService);
  readonly brl = formatBRL;
  readonly pct = (r: number) => formatPercent(r, 0);
  readonly categories = Object.entries(INCOME_CATEGORIES) as [IncomeCategory, (typeof INCOME_CATEGORIES)[IncomeCategory]][];
  readonly cat = (c: IncomeCategory) => INCOME_CATEGORIES[c] ?? INCOME_CATEGORIES.other;

  readonly month = signal(new Date().toISOString().slice(0, 7));
  readonly adding = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');

  category: IncomeCategory = 'salary';
  description = '';
  amount = '';
  receivedOn = today();
  recurring = true;
  isPrivate = false;

  readonly isCurrentMonth = computed(() => this.month() === new Date().toISOString().slice(0, 7));
  readonly monthItems = computed(() => this.incomes.incomes().filter((i) => countsInMonth(i, this.month())));
  readonly totals = computed(() => {
    let regular = 0;
    let extra = 0;
    for (const i of this.monthItems()) {
      if (!i.recurring && this.cat(i.category).extra) extra += i.amount_cents;
      else regular += i.amount_cents;
    }
    return { regular, extra, total: regular + extra };
  });
  readonly monthLabel = computed(() => {
    const [y, m] = this.month().split('-').map(Number);
    return `${MONTHS[m - 1]} ${y}`;
  });

  ionViewWillEnter(): void {
    void this.finance.loadAll().catch(() => this.error.set('Não deu para carregar as receitas.'));
  }

  shift(delta: number): void {
    const [y, m] = this.month().split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    this.month.set(d.toISOString().slice(0, 7));
  }

  startAdd(): void {
    this.error.set('');
    this.category = 'salary';
    this.description = '';
    this.amount = '';
    this.receivedOn = today();
    this.recurring = true;
    this.isPrivate = false;
    this.adding.set(true);
  }

  /** Extras (13º, férias…) costumam ser únicos; salário e aluguel, recorrentes. */
  onCategory(): void {
    this.recurring = ['salary', 'rent'].includes(this.category);
  }

  async save(): Promise<void> {
    const amountCents = parseBRL(this.amount);
    if (!amountCents || amountCents <= 0) return this.error.set('Informe o valor recebido.');
    if (!this.receivedOn) return this.error.set('Informe a data.');
    this.error.set('');
    this.busy.set(true);
    try {
      await this.incomes.create({
        description: this.description.trim() || this.cat(this.category).label,
        category: this.category,
        amountCents,
        receivedOn: this.receivedOn,
        recurring: this.recurring,
        icon: this.cat(this.category).icon,
        private: this.isPrivate,
      });
      this.adding.set(false);
      this.month.set(this.receivedOn.slice(0, 7));
    } catch {
      this.error.set('Não deu para salvar.');
    } finally {
      this.busy.set(false);
    }
  }

  async end(i: Income): Promise<void> {
    const [y, m] = this.month().split('-').map(Number);
    const lastDayPrev = new Date(Date.UTC(y, m - 1, 0)).toISOString().slice(0, 10);
    try {
      // Encerra no fim do mês anterior ao exibido: este mês deixa de contar.
      await this.incomes.end(i.id, lastDayPrev < i.received_on ? i.received_on : lastDayPrev);
    } catch {
      this.error.set('Não deu para atualizar.');
    }
  }

  async remove(i: Income): Promise<void> {
    if (!(await this.auth.confirmSensitive('Confirme para apagar a receita'))) return;
    try {
      await this.incomes.remove(i.id);
    } catch {
      this.error.set('Não deu para apagar.');
    }
  }

  date(iso: string): string {
    return new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR');
  }
}
