import { Cents } from './amortization';

export type IncomeCategory = 'salary' | 'thirteenth' | 'vacation' | 'freelance' | 'rent' | 'tax_refund' | 'bonus' | 'other';

export const INCOME_CATEGORIES: Record<IncomeCategory, { label: string; icon: string; extra: boolean }> = {
  salary: { label: 'Salário', icon: 'briefcase-outline', extra: false },
  thirteenth: { label: '13º salário', icon: 'gift-outline', extra: true },
  vacation: { label: 'Férias', icon: 'airplane-outline', extra: true },
  freelance: { label: 'Freelance / bico', icon: 'construct-outline', extra: false },
  rent: { label: 'Aluguel recebido', icon: 'home-outline', extra: false },
  tax_refund: { label: 'Restituição do IR', icon: 'receipt-outline', extra: true },
  bonus: { label: 'PLR / bônus', icon: 'trending-up-outline', extra: true },
  other: { label: 'Outro', icon: 'cash-outline', extra: false },
};

export interface IncomeEntry {
  amount_cents: Cents;
  received_on: string; // yyyy-mm-dd
  recurring: boolean;
  ended_on: string | null;
  category: IncomeCategory;
}

/** Vale no mês (yyyy-mm): única recebida nele, ou recorrente iniciada até ele e não encerrada antes. */
export function countsInMonth(i: IncomeEntry, month: string): boolean {
  const start = i.received_on.slice(0, 7);
  if (!i.recurring) return start === month;
  if (start > month) return false;
  return !i.ended_on || i.ended_on.slice(0, 7) >= month;
}

export interface MonthIncome {
  totalCents: Cents;
  /** Renda que se repete (salário etc.): base do orçamento. */
  regularCents: Cents;
  /** Dinheiro extra do mês (13º, férias, restituição, bônus): candidato a amortizar ou investir. */
  extraCents: Cents;
}

export function incomeForMonth(incomes: IncomeEntry[], month: string): MonthIncome {
  let regular = 0;
  let extra = 0;
  for (const i of incomes) {
    if (!countsInMonth(i, month)) continue;
    if (!i.recurring && INCOME_CATEGORIES[i.category]?.extra) extra += i.amount_cents;
    else regular += i.amount_cents;
  }
  return { totalCents: regular + extra, regularCents: regular, extraCents: extra };
}

/** Parte da renda regular comprometida com parcelas (0,32 = 32%). null sem renda informada. */
export function commitmentRatio(monthlyPaymentsCents: Cents, regularIncomeCents: Cents): number | null {
  return regularIncomeCents > 0 ? monthlyPaymentsCents / regularIncomeCents : null;
}

/** Faixas usuais: até 30% saudável, até 40% atenção, acima disso risco. */
export function commitmentLevel(ratio: number | null): 'unknown' | 'ok' | 'attention' | 'risk' {
  if (ratio === null) return 'unknown';
  return ratio <= 0.3 ? 'ok' : ratio <= 0.4 ? 'attention' : 'risk';
}
