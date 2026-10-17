import { Injectable, computed, inject } from '@angular/core';
import { FormulaScope } from '../../../domain/ai-tools';
import { summarize } from '../../../domain/finance';
import { commitmentLevel, commitmentRatio, incomeForMonth } from '../../../domain/income';
import { DebtsService } from './debts.service';
import { HouseholdService } from './household.service';
import { IncomesService } from './incomes.service';
import { InvestmentsService } from './investments.service';
import { LoansService } from './loans.service';

/** Junta dívidas, empréstimos e investimentos num resumo único do lar. */
@Injectable({ providedIn: 'root' })
export class FinanceService {
  private debts = inject(DebtsService);
  private loans = inject(LoansService);
  private investments = inject(InvestmentsService);
  private household = inject(HouseholdService);
  private incomes = inject(IncomesService);

  readonly summary = computed(() =>
    summarize({
      debts: this.debts.debts(),
      loans: this.loans.loans(),
      investments: this.investments.investments(),
      monthlyExpensesCents: this.household.current()?.monthlyExpensesCents ?? null,
    }),
  );

  /** Renda do mês corrente (regular + extra) e quanto dela vai para parcelas. */
  readonly monthIncome = computed(() => incomeForMonth(this.incomes.incomes(), new Date().toISOString().slice(0, 7)));
  readonly commitment = computed(() => commitmentRatio(this.debts.dueThisMonthCents(), this.monthIncome().regularCents));
  readonly commitmentLevel = computed(() => commitmentLevel(this.commitment()));

  /** Maior rendimento mensal informado nas aplicações (para o simulador comparar com a dívida). */
  readonly bestInvestmentRate = computed(() => {
    const rates = this.investments.investments().map((i) => i.monthly_rate).filter((r): r is number => r !== null);
    return rates.length ? Math.max(...rates) : null;
  });

  /** Valores atuais das variáveis que as fórmulas podem usar (em reais). */
  readonly formulaScope = computed<FormulaScope>(() => {
    const s = this.summary();
    const debts = this.debts.debts();
    const r = (c: number) => Math.round(c) / 100;
    return {
      divida_total: r(s.debtCents),
      parcelas_mes: r(this.debts.dueThisMonthCents()),
      juros_restantes: r(debts.reduce((a, d) => a + d.interestLeftCents, 0)),
      maior_taxa: Math.max(0, ...debts.map((d) => d.monthly_rate * 100)),
      qtd_dividas: debts.filter((d) => d.balance_cents > 0).length,
      investido_total: r(s.investedCents),
      reserva: r(s.reserveCents),
      reserva_meses: s.reserveMonths ?? 0,
      gastos_mensais: r(this.household.current()?.monthlyExpensesCents ?? 0),
      te_devem: r(s.receivableCents),
      patrimonio: r(s.netWorthCents),
      renda_mes: r(this.monthIncome().totalCents),
      comprometimento: Math.round((this.commitment() ?? 0) * 1000) / 10,
    };
  });

  async loadAll(): Promise<void> {
    await Promise.all([this.debts.load(), this.loans.load(), this.investments.load(), this.incomes.load()]);
  }
}
