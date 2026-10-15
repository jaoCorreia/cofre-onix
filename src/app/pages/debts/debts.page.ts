import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonContent, IonHeader, IonIcon, IonTitle, IonToolbar, ViewWillEnter } from '@ionic/angular';
import { formatBRL, formatPercent } from '../../../domain/money';
import { DebtsService } from '../../core/data/debts.service';
import { HouseholdService } from '../../core/data/household.service';

/** Acima disso por mês é juro de rotativo/cheque especial: prioridade máxima. */
const URGENT_RATE = 0.05;

@Component({
  selector: 'app-debts',
  imports: [IonContent, IonHeader, IonToolbar, IonTitle, IonIcon, RouterLink],
  template: `
    <ion-header><ion-toolbar><ion-title>Dívidas</ion-title></ion-toolbar></ion-header>
    <ion-content>
      <div class="page">
        <section class="card">
          <div class="muted">Total devido</div>
          <div class="big">{{ brl(total()) }}</div>
          <div class="muted">Ordenadas da mais cara para a mais barata (método avalanche)</div>
        </section>

        @if (debts.debts().length) {
          <section class="card">
            @for (d of debts.debts(); track d.id) {
              <a class="row" [routerLink]="['/dividas', d.id]" style="color:inherit;text-decoration:none">
                <div class="l">
                  <div class="dot down"><ion-icon [name]="d.icon || 'receipt-outline'" aria-hidden="true" /></div>
                  <div>
                    {{ d.name }} @if (d.private) { <span class="pill">privada</span> }
                    <div class="muted">{{ pct(d.monthly_rate) }} a.m. · {{ d.installments - d.remaining }} de {{ d.installments }}</div>
                    <div class="bar"><i [style.width.%]="progress(d)"></i></div>
                  </div>
                </div>
                @if (d.monthly_rate >= urgent) {
                  <span class="pill warn">Quitar já</span>
                } @else {
                  <span class="num">{{ brl(d.balance_cents) }}</span>
                }
              </a>
            }
          </section>
        } @else {
          <section class="card empty">
            <ion-icon name="receipt-outline" aria-hidden="true" />
            <p class="muted" style="margin:0">Cadastre um financiamento, empréstimo ou cartão. As parcelas são calculadas para você.</p>
          </section>
        }

        @if (household.canEdit()) {
          <a class="btn primary block" routerLink="/dividas/nova"><ion-icon name="add-outline" aria-hidden="true" /> Nova dívida</a>
        }
      </div>
    </ion-content>
  `,
})
export class DebtsPage implements ViewWillEnter {
  readonly debts = inject(DebtsService);
  readonly household = inject(HouseholdService);
  readonly brl = formatBRL;
  readonly pct = formatPercent;
  readonly urgent = URGENT_RATE;
  readonly total = computed(() => this.debts.debts().reduce((s, d) => s + d.balance_cents, 0));

  ionViewWillEnter(): void {
    void this.debts.load();
  }

  progress(d: { principal_cents: number; balance_cents: number }): number {
    return d.principal_cents ? Math.round((1 - d.balance_cents / d.principal_cents) * 100) : 0;
  }
}
