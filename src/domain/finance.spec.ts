import { describe, expect, it } from 'vitest';
import { annualToMonthly, netOfIncomeTax, summarize } from './finance';

describe('summarize', () => {
  const base = {
    debts: [{ balance_cents: 3_000_000 }, { balance_cents: 100_000 }],
    loans: [
      { direction: 'lent' as const, amount_cents: 180_000, paid_cents: 60_000 },
      { direction: 'borrowed' as const, amount_cents: 50_000, paid_cents: 0 },
    ],
    investments: [
      { balance_cents: 1_200_000, is_emergency_reserve: true },
      { balance_cents: 620_000, is_emergency_reserve: false },
    ],
    monthlyExpensesCents: 300_000,
  };

  it('soma dívidas, empréstimos e investimentos', () => {
    const s = summarize(base);
    expect(s.debtCents).toBe(3_100_000);
    expect(s.receivableCents).toBe(120_000);
    expect(s.payableLoansCents).toBe(50_000);
    expect(s.investedCents).toBe(1_820_000);
    expect(s.netWorthCents).toBe(1_820_000 + 120_000 - 3_100_000 - 50_000);
  });

  it('reserva em meses de gastos', () => {
    expect(summarize(base).reserveMonths).toBe(4);
    expect(summarize({ ...base, monthlyExpensesCents: null }).reserveMonths).toBeNull();
    expect(summarize({ ...base, monthlyExpensesCents: 0 }).reserveMonths).toBeNull();
  });

  it('empréstimo pago a mais não vira valor negativo', () => {
    const s = summarize({ ...base, loans: [{ direction: 'lent', amount_cents: 100, paid_cents: 500 }] });
    expect(s.receivableCents).toBe(0);
  });
});

describe('taxas', () => {
  it('12% ao ano equivale a ~0,949% ao mês', () => {
    expect(annualToMonthly(0.12)).toBeCloseTo(0.009489, 5);
  });
  it('IR regressivo', () => {
    expect(netOfIncomeTax(0.01, 100)).toBeCloseTo(0.00775);
    expect(netOfIncomeTax(0.01, 800)).toBeCloseTo(0.0085);
  });
});
