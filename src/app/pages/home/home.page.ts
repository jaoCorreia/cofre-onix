import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { IonContent, IonHeader, IonIcon, IonRefresher, IonRefresherContent, IonTitle, IonToolbar, ViewWillEnter } from '@ionic/angular';
import { simulatePrepayment } from '../../../domain/prepayment';
import { formatBRL, formatPercent } from '../../../domain/money';
import { DebtsService } from '../../core/data/debts.service';
import { HouseholdService } from '../../core/data/household.service';

const TIP_EXTRA = 100_000; // R$ 1.000 para a dica do início

@Component({
  selector: 'app-home',
  imports: [IonContent, IonHeader, IonToolbar, IonTitle, IonIcon, IonRefresher, IonRefresherContent, RouterLink],
  template: `
    <ion-header><ion-toolbar><ion-title>{{ household.current()?.name }}</ion-title></ion-toolbar></ion-header>
    <ion-content>
      <ion-refresher slot="fixed" (ionRefresh)="refresh($event)"><ion-refresher-content /></ion-refresher>
      <div class="page">
        <section class="card">
          <div class="muted">Total em dívidas</div>
          <div class="big down">{{ brl(totalDebt()) }}</div>
          <div class="muted">{{ debts.debts().length }} dívida(s) · parcelas do mês <span class="num">{{ brl(monthDue()) }}</span></div>
        </section>

        <nav class="tiles" aria-label="Ações rápidas">
          @for (t of tiles; track t.label) {
            <button class="tile" (click)="go(t.to)"><ion-icon [name]="t.icon" [style.color]="t.color" aria-hidden="true" />{{ t.label }}</button>
          }
        </nav>

        @if (tip(); as t) {
          <section class="card accent">
            <h2><ion-icon name="sparkles-outline" class="gold" aria-hidden="true" /> Onde vale amortizar</h2>
            <p class="muted" style="margin:0 0 10px">
              {{ t.name }} é a dívida mais cara ({{ pct(t.rate) }} a.m.). Com {{ brl(tipExtra) }} extra reduzindo o prazo, você deixa de pagar
              <b class="num up">{{ brl(t.saved) }}</b> em juros. Antes, confira se sua reserva cobre de 3 a 6 meses de gastos.
            </p>
            <a class="btn primary" [routerLink]="['/dividas', t.id]">Simular</a>
          </section>
        }

        <section class="card">
          <h2>Próximos vencimentos</h2>
          @for (i of debts.upcoming(); track i.id) {
            <div class="row">
              <div class="l"><div class="dot down"><ion-icon name="receipt-outline" /></div>
                <div>{{ i.debt_name }} {{ i.n }}ª<div class="muted">{{ date(i.due_date) }}</div></div></div>
              <span class="num down">{{ brl(i.payment_cents) }}</span>
            </div>
          } @empty {
            <p class="muted">Nada a vencer. Cadastre uma dívida para acompanhar as parcelas.</p>
          }
        </section>
      </div>
    </ion-content>
  `,
})
export class HomePage implements ViewWillEnter {
  readonly household = inject(HouseholdService);
  readonly debts = inject(DebtsService);
  private router = inject(Router);
  readonly brl = formatBRL;
  readonly pct = formatPercent;
  readonly tipExtra = TIP_EXTRA;

  readonly tiles = [
    { label: 'Paguei', icon: 'checkmark-circle-outline', color: 'var(--cofre-gain)', to: '/dividas' },
    { label: 'Nova dívida', icon: 'add-outline', color: 'var(--cofre-debt)', to: '/dividas/nova' },
    { label: 'Emprestei', icon: 'swap-horizontal-outline', color: 'var(--cofre-loan)', to: '/investir' },
    { label: 'Anexar', icon: 'document-text-outline', color: 'var(--cofre-gold)', to: '/docs' },
    { label: 'Amortizar', icon: 'cut-outline', color: 'var(--cofre-gold)', to: '/dividas' },
    { label: 'Perguntar', icon: 'sparkles-outline', color: 'var(--cofre-gold)', to: '/ia' },
  ];

  readonly totalDebt = computed(() => this.debts.debts().reduce((s, d) => s + d.balance_cents, 0));
  readonly monthDue = computed(() => {
    const month = new Date().toISOString().slice(0, 7);
    return this.debts.upcoming().filter((i) => i.due_date?.startsWith(month)).reduce((s, i) => s + i.payment_cents, 0);
  });

  /** Avalanche: a dívida de maior taxa, com a economia de amortizar R$ 1.000 nela. */
  readonly tip = computed(() => {
    const d = this.debts.debts().filter((x) => x.balance_cents > 0)[0];
    if (!d) return null;
    if (d.remaining === 0) return null;
    const extra = Math.min(TIP_EXTRA, d.balance_cents);
    const sim = simulatePrepayment({ balance: d.balance_cents, monthlyRate: d.monthly_rate, remaining: d.remaining, extra, system: d.system });
    return { id: d.id, name: d.name, rate: Number(d.monthly_rate), saved: sim.reduceTerm.interestSaved };
  });

  ionViewWillEnter(): void {
    void this.debts.load();
  }

  async refresh(ev: CustomEvent): Promise<void> {
    await this.debts.load();
    (ev.target as HTMLIonRefresherElement).complete();
  }

  go(to: string): void {
    void this.router.navigateByUrl(to);
  }

  date(iso: string | null): string {
    return iso ? new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) : '';
  }
}
