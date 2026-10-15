import { Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonBackButton, IonButtons, IonContent, IonHeader, IonIcon, IonTitle, IonToolbar, ViewWillEnter } from '@ionic/angular';
import { MIN_RESERVE_MONTHS } from '../../../domain/advisor';
import { simulatePrepayment } from '../../../domain/prepayment';
import { formatBRL, formatPercent, parseBRL, parsePercent } from '../../../domain/money';
import { AuthService } from '../../core/auth/auth.service';
import { DebtsService } from '../../core/data/debts.service';
import { HouseholdService } from '../../core/data/household.service';
import { InstallmentRow } from '../../core/data/models';

@Component({
  selector: 'app-debt-detail',
  imports: [IonContent, IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon, FormsModule],
  template: `
    <ion-header><ion-toolbar>
      <ion-buttons slot="start"><ion-back-button defaultHref="/dividas" text="" /></ion-buttons>
      <ion-title>{{ debt()?.name }}</ion-title>
    </ion-toolbar></ion-header>
    <ion-content>
      @if (debt(); as d) {
        <div class="page">
          <section class="card">
            <div class="muted">Saldo devedor</div>
            <div class="big">{{ brl(d.balance_cents) }}</div>
            <div class="muted">{{ pct(d.monthly_rate) }} a.m. · {{ d.system === 'price' ? 'Price' : 'SAC' }} · faltam {{ d.remaining }} de {{ d.installments }}</div>
            <div class="bar"><i [style.width.%]="progress()"></i></div>
          </section>

          @if (d.remaining > 0) {
            <section class="card">
              <h2><ion-icon name="cut-outline" class="gold" aria-hidden="true" /> Simular amortização</h2>
              <div class="form">
                <label>Valor extra (R$)<input id="s-extra" inputmode="decimal" [(ngModel)]="extra" (ngModelChange)="touch()" /></label>
                <label>Seu investimento rende (% a.m. líquido)<input id="s-inv" inputmode="decimal" [(ngModel)]="invRate" (ngModelChange)="touch()" /></label>
                <label class="full">Sua reserva cobre quantos meses de gastos?<input id="s-res" inputmode="decimal" [(ngModel)]="reserve" (ngModelChange)="touch()" /></label>
              </div>

              @if (sim(); as s) {
                <div class="tiles" style="grid-template-columns:1fr 1fr;margin-top:12px">
                  <div class="card" [class.accent]="s.termWins" style="background:var(--cofre-surface-2)">
                    <div class="muted">Reduzir prazo</div>
                    <div class="num up" style="font-size:18px">{{ brl(s.reduceTerm.interestSaved) }}</div>
                    <div class="muted">menos {{ d.remaining - s.reduceTerm.remaining }} parcela(s)</div>
                  </div>
                  <div class="card" [class.accent]="!s.termWins" style="background:var(--cofre-surface-2)">
                    <div class="muted">Reduzir parcela</div>
                    <div class="num up" style="font-size:18px">{{ brl(s.reducePayment.interestSaved) }}</div>
                    <div class="muted">parcela {{ brl(s.reducePayment.payment) }}</div>
                  </div>
                </div>
                <div style="margin-top:10px">
                  <div class="check"><ion-icon [name]="s.reserveOk ? 'checkmark-circle-outline' : 'alert-circle-outline'" [class.up]="s.reserveOk" [style.color]="s.reserveOk ? null : 'var(--cofre-warn)'" />
                    <span>{{ s.reserveOk ? 'Reserva acima do mínimo de ' + minReserve + ' meses.' : 'Reserva abaixo de ' + minReserve + ' meses. Complete a reserva antes de amortizar.' }}</span></div>
                  <div class="check"><ion-icon [name]="s.debtCostsMore ? 'checkmark-circle-outline' : 'alert-circle-outline'" [class.up]="s.debtCostsMore" [style.color]="s.debtCostsMore ? null : 'var(--cofre-warn)'" />
                    <span>{{ s.debtCostsMore ? 'A dívida custa mais do que seu dinheiro rende. Amortizar compensa.' : 'Seu investimento rende mais que a dívida custa. Manter investido pode valer mais.' }}</span></div>
                  <div class="check"><ion-icon name="book-outline" class="gold" />
                    <span>Pelo Código de Defesa do Consumidor, o banco deve abater os juros futuros do valor amortizado. Confira o saldo que ele informar.</span></div>
                </div>
                <p class="muted" style="font-size:11px;margin:8px 0 0">Simulação educativa. Não é recomendação de investimento.</p>
              }
            </section>
          }

          <section class="card">
            <h2>Parcelas</h2>
            @for (i of installments(); track i.id) {
              <div class="row">
                <div>
                  <span class="num">{{ i.n }}ª</span> · {{ date(i.due_date) }}
                  <div class="muted">juros {{ brl(i.interest_cents) }} · amortiza {{ brl(i.amortization_cents) }}</div>
                </div>
                @if (household.canEdit()) {
                  <button class="btn" [class.primary]="!i.paid_at" style="padding:6px 10px" (click)="toggle(i)" [disabled]="busy()">
                    {{ i.paid_at ? 'Paga ✓' : 'Pagar ' + brl(i.payment_cents) }}
                  </button>
                } @else {
                  <span class="pill" [class.ok]="i.paid_at">{{ i.paid_at ? 'paga' : brl(i.payment_cents) }}</span>
                }
              </div>
            }
          </section>

          @if (household.canEdit()) {
            <button class="btn danger block" (click)="remove()"><ion-icon name="trash-outline" aria-hidden="true" /> Apagar dívida</button>
          }
          @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
        </div>
      }
    </ion-content>
  `,
})
export class DebtDetailPage implements ViewWillEnter {
  readonly id = input.required<string>();
  private debtsSvc = inject(DebtsService);
  private auth = inject(AuthService);
  private router = inject(Router);
  readonly household = inject(HouseholdService);
  readonly brl = formatBRL;
  readonly pct = formatPercent;
  readonly minReserve = MIN_RESERVE_MONTHS;

  readonly installments = signal<InstallmentRow[]>([]);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly debt = computed(() => this.debtsSvc.debts().find((d) => d.id === this.id()) ?? null);
  readonly progress = computed(() => {
    const d = this.debt();
    return d && d.principal_cents ? Math.round((1 - d.balance_cents / d.principal_cents) * 100) : 0;
  });

  extra = '1.000,00';
  invRate = '0,8';
  reserve = '4';
  private version = signal(0);

  touch(): void {
    this.version.update((v) => v + 1);
  }

  readonly sim = computed(() => {
    this.version();
    const d = this.debt();
    const extra = parseBRL(this.extra);
    const inv = parsePercent(this.invRate);
    const reserve = Number(this.reserve.replace(',', '.'));
    if (!d || d.remaining === 0 || !extra || extra <= 0 || inv === null || !Number.isFinite(reserve)) return null;
    const r = simulatePrepayment({
      balance: d.balance_cents,
      monthlyRate: d.monthly_rate,
      remaining: d.remaining,
      extra: Math.min(extra, d.balance_cents),
      system: d.system,
    });
    return {
      ...r,
      termWins: r.reduceTerm.interestSaved >= r.reducePayment.interestSaved,
      reserveOk: reserve >= MIN_RESERVE_MONTHS,
      debtCostsMore: d.monthly_rate > inv,
    };
  });

  async ionViewWillEnter(): Promise<void> {
    if (!this.debt()) await this.debtsSvc.load();
    this.installments.set(await this.debtsSvc.installments(this.id()));
  }

  async toggle(i: InstallmentRow): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      await this.debtsSvc.setPaid(i.id, !i.paid_at);
      this.installments.set(await this.debtsSvc.installments(this.id()));
    } catch (e) {
      console.error(e);
      this.error.set('Não deu para atualizar a parcela.');
    } finally {
      this.busy.set(false);
    }
  }

  async remove(): Promise<void> {
    if (!(await this.auth.confirmSensitive('Confirme para apagar a dívida'))) return;
    try {
      await this.debtsSvc.remove(this.id());
      await this.router.navigateByUrl('/dividas', { replaceUrl: true });
    } catch (e) {
      console.error(e);
      this.error.set('Não deu para apagar a dívida.');
    }
  }

  date(iso: string | null): string {
    return iso ? new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR') : '';
  }
}
