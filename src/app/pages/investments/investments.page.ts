import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonContent, IonHeader, IonIcon, IonTitle, IonToolbar, ViewWillEnter } from '@ionic/angular';
import { MIN_RESERVE_MONTHS } from '../../../domain/advisor';
import { annualToMonthly } from '../../../domain/finance';
import { formatBRL, formatPercent, parseBRL, parsePercent } from '../../../domain/money';
import { IconPickerComponent } from '../../components/icon-picker.component';
import { AuthService } from '../../core/auth/auth.service';
import { FinanceService } from '../../core/data/finance.service';
import { HouseholdService } from '../../core/data/household.service';
import { InvestmentsService } from '../../core/data/investments.service';
import { Investment } from '../../core/data/models';

const KINDS = ['Reserva', 'CDB', 'Tesouro Direto', 'Poupança', 'LCI/LCA', 'Ações', 'FII', 'Cripto', 'Previdência', 'Outro'];
const MAX_RESERVE_MONTHS = 6;

@Component({
  selector: 'app-investments',
  imports: [IonContent, IonHeader, IonToolbar, IonTitle, IonIcon, FormsModule, IconPickerComponent],
  template: `
    <ion-header><ion-toolbar><ion-title>Investimentos</ion-title></ion-toolbar></ion-header>
    <ion-content>
      <div class="page">
        <section class="card">
          <div class="muted">Investido</div>
          <div class="big">{{ brl(finance.summary().investedCents) }}</div>
          <div class="muted">Patrimônio líquido <span class="num" [class.up]="finance.summary().netWorthCents >= 0" [class.down]="finance.summary().netWorthCents < 0">{{ brl(finance.summary().netWorthCents) }}</span></div>
        </section>

        <section class="card" [class.accent]="reserveState() !== 'ok'">
          <h2><ion-icon name="shield-checkmark-outline" class="gold" aria-hidden="true" /> Reserva de emergência</h2>
          @if (finance.summary().reserveMonths !== null) {
            <div class="row" style="border:0">
              <span>{{ brl(finance.summary().reserveCents) }}</span>
              <span class="num" [class.up]="reserveState() === 'ok'" [style.color]="reserveState() === 'ok' ? null : 'var(--cofre-warn)'">
                {{ finance.summary().reserveMonths }} {{ finance.summary().reserveMonths === 1 ? 'mês' : 'meses' }}
              </span>
            </div>
            <div class="bar"><i [style.width.%]="reservePct()" [style.background]="reserveState() === 'ok' ? 'var(--cofre-gain)' : 'var(--cofre-warn)'"></i></div>
            <p class="muted" style="margin:8px 0 0">{{ reserveText() }}</p>
          } @else {
            <p class="muted" style="margin:0">Informe quanto o lar gasta por mês para saber quantos meses a reserva cobre.</p>
          }
          @if (household.isOwner()) {
            <div class="pay">
              <label class="field" style="flex:1">Gastos mensais do lar (R$)
                <input class="field" id="inv-exp" inputmode="decimal" [(ngModel)]="expenses" placeholder="3.000,00" />
              </label>
              <button class="btn" style="align-self:flex-end" (click)="saveExpenses()">Salvar</button>
            </div>
          }
        </section>

        @if (investments.investments().length) {
          <section class="card">
            @for (i of investments.investments(); track i.id) {
              <button class="row as-btn" (click)="edit(i)" [disabled]="!household.canEdit()">
                <div class="l">
                  <div class="dot up"><ion-icon [name]="i.icon || 'trending-up-outline'" aria-hidden="true" /></div>
                  <div>
                    {{ i.name }}
                    @if (i.is_emergency_reserve) { <span class="pill ok">reserva</span> }
                    @if (i.private) { <span class="pill">privado</span> }
                    <div class="muted">{{ i.kind }}{{ i.indexer ? ' · ' + i.indexer : '' }}{{ i.monthly_rate !== null ? ' · ' + pct(i.monthly_rate) + ' a.m.' : '' }}</div>
                  </div>
                </div>
                <span class="num">{{ brl(i.balance_cents) }}</span>
              </button>
            }
          </section>
        } @else if (!form()) {
          <section class="card empty">
            <ion-icon name="trending-up-outline" aria-hidden="true" />
            <p class="muted" style="margin:0">Cadastre sua reserva e seus investimentos. O app compara o rendimento com o juro das dívidas antes de sugerir amortizar.</p>
          </section>
        }

        @if (form(); as f) {
          <section class="card">
            <h2>{{ f.id ? 'Editar investimento' : 'Novo investimento' }}</h2>
            <div class="form">
              <label class="full">Nome<input id="i-name" type="text" [(ngModel)]="f.name" placeholder="CDB liquidez diária" maxlength="80" /></label>
              <label>Tipo
                <select id="i-kind" [(ngModel)]="f.kind">@for (k of kinds; track k) { <option [value]="k">{{ k }}</option> }</select>
              </label>
              <label>Indexador<input id="i-idx" type="text" [(ngModel)]="f.indexer" placeholder="100% CDI" maxlength="40" /></label>
              <label>Saldo atual (R$)<input id="i-bal" inputmode="decimal" [(ngModel)]="f.balance" placeholder="12.000,00" /></label>
              <label>Rende (% ao ano, líquido)<input id="i-rate" inputmode="decimal" [(ngModel)]="f.annualRate" placeholder="10" /></label>
              <label class="full" style="flex-direction:row;align-items:center;gap:8px">
                <input id="i-res" type="checkbox" [(ngModel)]="f.reserve" style="width:auto" /> Faz parte da reserva de emergência
              </label>
              <label class="full" style="flex-direction:row;align-items:center;gap:8px">
                <input id="i-priv" type="checkbox" [(ngModel)]="f.private" style="width:auto" /> Privado (só eu vejo)
              </label>
            </div>
            <div style="margin-top:12px"><app-icon-picker [(value)]="f.icon" [hint]="f.name + ' ' + f.kind" [preferred]="['shield-checkmark-outline','leaf-outline','trending-up-outline','business-outline']" /></div>
            @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
            <div class="pay">
              <button class="btn primary" (click)="save(f)" [disabled]="busy()">Salvar</button>
              <button class="btn" (click)="form.set(null)">Cancelar</button>
              @if (f.id) { <button class="btn danger" (click)="remove(f.id)" aria-label="Apagar"><ion-icon name="trash-outline" /></button> }
            </div>
          </section>
        } @else if (household.canEdit()) {
          <button class="btn primary block" (click)="startNew()"><ion-icon name="add-outline" aria-hidden="true" /> Novo investimento</button>
        }
        @if (error() && !form()) { <p class="error" role="alert">{{ error() }}</p> }
        <p class="muted" style="font-size:11px">Informe o rendimento já descontado o imposto de renda. Valores informativos, não são recomendação de investimento.</p>
      </div>
    </ion-content>
  `,
  styles: `
    .as-btn { width: 100%; background: none; border: 0; border-bottom: 1px solid var(--cofre-line); color: inherit; font: inherit; text-align: left; cursor: pointer; }
    .as-btn:last-child { border-bottom: 0; }
    .pay { display: flex; gap: 8px; margin-top: 12px; align-items: center; }
    .pay .btn { padding: 10px 12px; }
  `,
})
export class InvestmentsPage implements ViewWillEnter {
  readonly investments = inject(InvestmentsService);
  readonly finance = inject(FinanceService);
  readonly household = inject(HouseholdService);
  private auth = inject(AuthService);
  readonly brl = formatBRL;
  readonly pct = (r: number) => formatPercent(r);
  readonly kinds = KINDS;

  readonly form = signal<Form | null>(null);
  readonly busy = signal(false);
  readonly error = signal('');
  expenses = '';

  readonly reserveState = computed(() => {
    const m = this.finance.summary().reserveMonths;
    return m === null ? 'unknown' : m < MIN_RESERVE_MONTHS ? 'low' : 'ok';
  });
  readonly reservePct = computed(() => Math.min(100, ((this.finance.summary().reserveMonths ?? 0) / MAX_RESERVE_MONTHS) * 100));
  readonly reserveText = computed(() => {
    const m = this.finance.summary().reserveMonths ?? 0;
    if (m < MIN_RESERVE_MONTHS) return `Abaixo do mínimo de ${MIN_RESERVE_MONTHS} meses. Antes de amortizar dívidas baratas, complete a reserva.`;
    if (m > MAX_RESERVE_MONTHS) return `Acima de ${MAX_RESERVE_MONTHS} meses: o excedente pode amortizar dívidas caras ou render mais em outro lugar.`;
    return 'Reserva na faixa recomendada de 3 a 6 meses de gastos.';
  });

  async ionViewWillEnter(): Promise<void> {
    const c = this.household.current()?.monthlyExpensesCents;
    this.expenses = c ? formatBRL(c).replace('R$ ', '') : '';
    try {
      await this.finance.loadAll();
    } catch {
      this.error.set('Não deu para carregar os dados.');
    }
  }

  async saveExpenses(): Promise<void> {
    const cents = this.expenses.trim() ? parseBRL(this.expenses) : null;
    if (this.expenses.trim() && (!cents || cents < 0)) return this.error.set('Valor de gastos inválido.');
    try {
      await this.household.setMonthlyExpenses(cents);
      this.error.set('');
    } catch {
      this.error.set('Não deu para salvar os gastos.');
    }
  }

  startNew(): void {
    this.error.set('');
    this.form.set({ id: null, name: '', kind: 'Reserva', indexer: '', balance: '', annualRate: '', reserve: true, private: false, icon: 'shield-checkmark-outline' });
  }

  edit(i: Investment): void {
    this.error.set('');
    const annual = i.monthly_rate === null ? '' : String(Math.round((Math.pow(1 + i.monthly_rate, 12) - 1) * 10000) / 100).replace('.', ',');
    this.form.set({
      id: i.id, name: i.name, kind: i.kind, indexer: i.indexer ?? '', balance: formatBRL(i.balance_cents).replace('R$ ', ''),
      annualRate: annual, reserve: i.is_emergency_reserve, private: i.private, icon: i.icon ?? 'trending-up-outline',
    });
  }

  async save(f: Form): Promise<void> {
    const balanceCents = parseBRL(f.balance);
    const annual = f.annualRate.trim() ? parsePercent(f.annualRate) : null;
    if (!f.name.trim()) return this.error.set('Dê um nome ao investimento.');
    if (balanceCents === null || balanceCents < 0) return this.error.set('Informe o saldo.');
    if (f.annualRate.trim() && (annual === null || annual > 2)) return this.error.set('Rendimento anual inválido.');
    this.busy.set(true);
    this.error.set('');
    const input = {
      name: f.name.trim(), kind: f.kind, indexer: f.indexer.trim(), balanceCents,
      monthlyRate: annual === null ? null : annualToMonthly(annual), isEmergencyReserve: f.reserve, icon: f.icon, private: f.private,
    };
    try {
      if (f.id) await this.investments.update(f.id, input);
      else await this.investments.create(input);
      this.form.set(null);
    } catch {
      this.error.set('Não deu para salvar.');
    } finally {
      this.busy.set(false);
    }
  }

  async remove(id: string): Promise<void> {
    if (!(await this.auth.confirmSensitive('Confirme para apagar o investimento'))) return;
    try {
      await this.investments.remove(id);
      this.form.set(null);
    } catch {
      this.error.set('Não deu para apagar.');
    }
  }
}

interface Form {
  id: string | null;
  name: string;
  kind: string;
  indexer: string;
  balance: string;
  annualRate: string;
  reserve: boolean;
  private: boolean;
  icon: string;
}
