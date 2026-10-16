import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { IonContent, IonHeader, IonIcon, IonRefresher, IonRefresherContent, IonTitle, IonToolbar, ViewWillEnter } from '@ionic/angular';
import { adviseExtraMoney, MIN_RESERVE_MONTHS } from '../../../domain/advisor';
import { formatBRL, formatPercent } from '../../../domain/money';
import { DebtsService } from '../../core/data/debts.service';
import { FinanceService } from '../../core/data/finance.service';
import { HouseholdService } from '../../core/data/household.service';
import { LoansService } from '../../core/data/loans.service';

const TIP_EXTRA = 100_000; // R$ 1.000 para a dica do início

type Tip =
  | { kind: 'set_expenses' }
  | { kind: 'build_reserve'; months: number }
  | { kind: 'keep_invested'; name: string; debtRate: number; invRate: number }
  | { kind: 'prepay'; id: string; name: string; rate: number; saved: number; mode: 'reduce_term' | 'reduce_payment' };

@Component({
  selector: 'app-home',
  imports: [IonContent, IonHeader, IonToolbar, IonTitle, IonIcon, IonRefresher, IonRefresherContent, RouterLink],
  template: `
    <ion-header><ion-toolbar><ion-title>{{ household.current()?.name }}</ion-title></ion-toolbar></ion-header>
    <ion-content>
      <ion-refresher slot="fixed" (ionRefresh)="refresh($event)"><ion-refresher-content /></ion-refresher>
      <div class="page">
        <section class="card">
          <div class="muted">Patrimônio líquido</div>
          <div class="big" [class.up]="s().netWorthCents >= 0" [class.down]="s().netWorthCents < 0">{{ brl(s().netWorthCents) }}</div>
          <div class="summary">
            <a routerLink="/dividas"><span class="muted">Dívidas</span><b class="num down">{{ brl(s().debtCents) }}</b></a>
            <a routerLink="/investir"><span class="muted">Investido</span><b class="num up">{{ brl(s().investedCents) }}</b></a>
            <a routerLink="/emprestimos"><span class="muted">Te devem</span><b class="num loan">{{ brl(s().receivableCents) }}</b></a>
          </div>
          <div class="muted" style="margin-top:8px">Parcelas deste mês <span class="num">{{ brl(debts.dueThisMonthCents()) }}</span></div>
        </section>

        <nav class="tiles" aria-label="Ações rápidas">
          @for (t of tiles; track t.label) {
            <button class="tile" (click)="go(t.to)"><ion-icon [name]="t.icon" [style.color]="t.color" aria-hidden="true" />{{ t.label }}</button>
          }
        </nav>

        @if (tip(); as t) {
          <section class="card accent">
            <h2><ion-icon name="sparkles-outline" class="gold" aria-hidden="true" /> {{ t.kind === 'prepay' ? 'Onde vale amortizar' : 'Antes de amortizar' }}</h2>
            @switch (t.kind) {
              @case ('set_expenses') {
                <p class="muted tip">Informe os gastos mensais do lar e a sua reserva para o app dizer se vale amortizar ou guardar.</p>
                <a class="btn primary" routerLink="/investir">Configurar reserva</a>
              }
              @case ('build_reserve') {
                <p class="muted tip">Sua reserva cobre <b class="num">{{ asReserve(t).months }}</b> meses de gastos. Complete pelo menos {{ minReserve }} meses antes de usar dinheiro extra para amortizar.</p>
                <a class="btn primary" routerLink="/investir">Ver reserva</a>
              }
              @case ('keep_invested') {
                <p class="muted tip">{{ asKeep(t).name }} custa {{ pct(asKeep(t).debtRate) }} a.m., menos que os {{ pct(asKeep(t).invRate) }} a.m. que seu dinheiro rende. Manter investido tende a valer mais.</p>
              }
              @case ('prepay') {
                <p class="muted tip">
                  {{ asPrepay(t).name }} é a dívida mais cara ({{ pct(asPrepay(t).rate) }} a.m.). Com {{ brl(tipExtra) }} extra
                  {{ asPrepay(t).mode === 'reduce_term' ? 'reduzindo o prazo' : 'reduzindo a parcela' }}, você deixa de pagar
                  <b class="num up">{{ brl(asPrepay(t).saved) }}</b> em juros.
                </p>
                <a class="btn primary" [routerLink]="['/dividas', asPrepay(t).id]">Simular</a>
              }
            }
          </section>
        }

        <section class="card">
          <h2>Próximos vencimentos</h2>
          @for (i of upcoming(); track i.key) {
            <div class="row">
              <div class="l"><div class="dot" [class.down]="i.out" [class.loan]="!i.out"><ion-icon [name]="i.icon" aria-hidden="true" /></div>
                <div>{{ i.label }}<div class="muted">{{ date(i.date) }}</div></div></div>
              <span class="num" [class.down]="i.out" [class.loan]="!i.out">{{ brl(i.cents) }}</span>
            </div>
          } @empty {
            <p class="muted">Nada a vencer. Cadastre uma dívida ou um empréstimo para acompanhar os prazos.</p>
          }
        </section>
      </div>
    </ion-content>
  `,
  styles: `
    .summary { display: flex; flex-direction: column; margin-top: 8px; }
    .summary a { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 8px 0; color: inherit; text-decoration: none; border-top: 1px solid var(--cofre-line); }
    .summary b { font-size: 14px; font-weight: 500; }
    .tip { margin: 0 0 10px; }
  `,
})
export class HomePage implements ViewWillEnter {
  readonly household = inject(HouseholdService);
  readonly debts = inject(DebtsService);
  private loans = inject(LoansService);
  private finance = inject(FinanceService);
  private router = inject(Router);
  readonly brl = formatBRL;
  readonly pct = formatPercent;
  readonly tipExtra = TIP_EXTRA;
  readonly minReserve = MIN_RESERVE_MONTHS;
  readonly s = this.finance.summary;

  readonly tiles = [
    { label: 'Paguei', icon: 'checkmark-circle-outline', color: 'var(--cofre-gain)', to: '/dividas' },
    { label: 'Nova dívida', icon: 'add-outline', color: 'var(--cofre-debt)', to: '/dividas/nova' },
    { label: 'Emprestei', icon: 'swap-horizontal-outline', color: 'var(--cofre-loan)', to: '/emprestimos' },
    { label: 'Anexar', icon: 'document-text-outline', color: 'var(--cofre-gold)', to: '/docs' },
    { label: 'Investir', icon: 'trending-up-outline', color: 'var(--cofre-gain)', to: '/investir' },
    { label: 'Perguntar', icon: 'sparkles-outline', color: 'var(--cofre-gold)', to: '/ia' },
  ];

  /** Regras do conselheiro: reserva primeiro, dívida mais cara, custo de oportunidade. */
  readonly tip = computed<Tip | null>(() => {
    const open = this.debts.debts().filter((d) => d.balance_cents > 0 && d.remaining > 0);
    if (!open.length) return null;
    const months = this.s().reserveMonths;
    if (months === null) return { kind: 'set_expenses' };
    const advice = adviseExtraMoney({
      extra: TIP_EXTRA,
      reserveMonths: months,
      investmentNetMonthlyRate: this.finance.bestInvestmentRate() ?? 0,
      debts: open.map((d) => ({ id: d.id, name: d.name, balance: d.balance_cents, monthlyRate: d.monthly_rate, remaining: d.remaining, system: d.system })),
    });
    const debt = (id: string) => open.find((d) => d.id === id)!;
    switch (advice.action) {
      case 'build_reserve':
        return { kind: 'build_reserve', months };
      case 'keep_invested':
        return { kind: 'keep_invested', name: debt(advice.debtId).name, debtRate: advice.debtRate, invRate: advice.investmentRate };
      case 'prepay':
        return { kind: 'prepay', id: advice.debtId, name: debt(advice.debtId).name, rate: debt(advice.debtId).monthly_rate, saved: advice.interestSaved, mode: advice.mode };
      default:
        return null;
    }
  });

  /** Parcelas de dívidas e prazos de empréstimos, em ordem de data. */
  readonly upcoming = computed(() => {
    const debts = this.debts.upcoming().map((i) => ({
      key: i.id, label: `${i.debt_name} ${i.n}ª`, date: i.due_date, cents: i.payment_cents, out: true, icon: 'receipt-outline',
    }));
    const loans = this.loans
      .loans()
      .filter((l) => l.due_date && l.paid_cents < l.amount_cents)
      .map((l) => ({
        key: l.id,
        label: l.direction === 'lent' ? `${l.counterparty} te paga` : `Pagar ${l.counterparty}`,
        date: l.due_date,
        cents: l.amount_cents - l.paid_cents,
        out: l.direction === 'borrowed',
        icon: l.icon || 'person-outline',
      }));
    return [...debts, ...loans].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '')).slice(0, 6);
  });

  ionViewWillEnter(): void {
    void this.finance.loadAll().catch(() => undefined);
  }

  async refresh(ev: CustomEvent): Promise<void> {
    await this.finance.loadAll().catch(() => undefined);
    (ev.target as HTMLIonRefresherElement).complete();
  }

  go(to: string): void {
    void this.router.navigateByUrl(to);
  }

  date(iso: string | null): string {
    return iso ? new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) : '';
  }

  asReserve = (t: Tip) => t as Extract<Tip, { kind: 'build_reserve' }>;
  asKeep = (t: Tip) => t as Extract<Tip, { kind: 'keep_invested' }>;
  asPrepay = (t: Tip) => t as Extract<Tip, { kind: 'prepay' }>;
}
