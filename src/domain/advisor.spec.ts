import { describe, expect, it } from 'vitest';
import { adviseExtraMoney, Debt } from './advisor';

const car: Debt = { id: 'car', name: 'Carro', balance: 2_740_000, monthlyRate: 0.021, remaining: 34, system: 'price' };
const card: Debt = { id: 'card', name: 'Rotativo', balance: 150_000, monthlyRate: 0.129, remaining: 1, system: 'price' };
const payroll: Debt = { id: 'pay', name: 'Consignado', balance: 326_000, monthlyRate: 0.016, remaining: 16, system: 'price' };

const base = { extra: 300_000, reserveMonths: 4.1, investmentNetMonthlyRate: 0.008 };

describe('adviseExtraMoney', () => {
  it('reserva abaixo de 3 meses: manda completar a reserva', () => {
    const a = adviseExtraMoney({ ...base, reserveMonths: 1.5, debts: [car] });
    expect(a.action).toBe('build_reserve');
  });

  it('avalanche: escolhe a dívida de maior taxa', () => {
    const a = adviseExtraMoney({ ...base, debts: [car, card, payroll] });
    expect(a.action).toBe('prepay');
    if (a.action === 'prepay') expect(a.debtId).toBe('card');
  });

  it('investimento rende mais que a dívida custa: manter investido', () => {
    const a = adviseExtraMoney({ ...base, investmentNetMonthlyRate: 0.03, debts: [car] });
    expect(a.action).toBe('keep_invested');
  });

  it('prefere reduzir prazo e informa a economia', () => {
    const a = adviseExtraMoney({ ...base, debts: [car] });
    expect(a.action).toBe('prepay');
    if (a.action === 'prepay') {
      expect(a.mode).toBe('reduce_term');
      expect(a.interestSaved).toBeGreaterThan(0);
    }
  });

  it('sem dívidas: investir', () => {
    expect(adviseExtraMoney({ ...base, debts: [] }).action).toBe('invest');
  });
});
