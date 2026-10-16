import { Cents } from './amortization';

/** Resumo financeiro do lar, usado no início, no simulador e pela IA. */
export interface FinanceInput {
  debts: { balance_cents: Cents }[];
  loans: { direction: 'lent' | 'borrowed'; amount_cents: Cents; paid_cents: Cents }[];
  investments: { balance_cents: Cents; is_emergency_reserve: boolean }[];
  monthlyExpensesCents: Cents | null;
}

export interface FinanceSummary {
  debtCents: Cents;
  receivableCents: Cents; // te devem
  payableLoansCents: Cents; // você deve em empréstimos pessoais
  investedCents: Cents;
  reserveCents: Cents;
  netWorthCents: Cents;
  /** Meses de gastos cobertos pela reserva; null se os gastos mensais não foram informados. */
  reserveMonths: number | null;
}

export function summarize(f: FinanceInput): FinanceSummary {
  const debtCents = f.debts.reduce((s, d) => s + d.balance_cents, 0);
  const open = (l: FinanceInput['loans'][number]) => Math.max(0, l.amount_cents - l.paid_cents);
  const receivableCents = f.loans.filter((l) => l.direction === 'lent').reduce((s, l) => s + open(l), 0);
  const payableLoansCents = f.loans.filter((l) => l.direction === 'borrowed').reduce((s, l) => s + open(l), 0);
  const investedCents = f.investments.reduce((s, i) => s + i.balance_cents, 0);
  const reserveCents = f.investments.filter((i) => i.is_emergency_reserve).reduce((s, i) => s + i.balance_cents, 0);
  const reserveMonths = f.monthlyExpensesCents && f.monthlyExpensesCents > 0 ? Math.round((reserveCents / f.monthlyExpensesCents) * 10) / 10 : null;
  return {
    debtCents,
    receivableCents,
    payableLoansCents,
    investedCents,
    reserveCents,
    netWorthCents: investedCents + receivableCents - debtCents - payableLoansCents,
    reserveMonths,
  };
}

/** Taxa mensal equivalente a uma taxa anual (juros compostos): 12% a.a. -> ~0,949% a.m. */
export function annualToMonthly(annualRate: number): number {
  return Math.pow(1 + annualRate, 1 / 12) - 1;
}

/** Rendimento mensal líquido de IR regressivo (renda fixa), dado o prazo em dias. */
export function netOfIncomeTax(monthlyRate: number, days: number): number {
  const ir = days <= 180 ? 0.225 : days <= 360 ? 0.2 : days <= 720 ? 0.175 : 0.15;
  return monthlyRate * (1 - ir);
}
