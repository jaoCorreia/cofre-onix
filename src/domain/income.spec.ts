import { describe, expect, it } from 'vitest';
import { commitmentLevel, commitmentRatio, countsInMonth, IncomeEntry, incomeForMonth } from './income';

const salary: IncomeEntry = { amount_cents: 500_000, received_on: '2026-03-05', recurring: true, ended_on: null, category: 'salary' };
const thirteenth: IncomeEntry = { amount_cents: 250_000, received_on: '2026-12-20', recurring: false, ended_on: null, category: 'thirteenth' };
const freela: IncomeEntry = { amount_cents: 80_000, received_on: '2026-12-02', recurring: false, ended_on: null, category: 'freelance' };

describe('countsInMonth', () => {
  it('recorrente vale do mês de início em diante', () => {
    expect(countsInMonth(salary, '2026-02')).toBe(false);
    expect(countsInMonth(salary, '2026-03')).toBe(true);
    expect(countsInMonth(salary, '2027-08')).toBe(true);
  });
  it('recorrente encerrada para de contar depois do fim', () => {
    const s = { ...salary, ended_on: '2026-06-30' };
    expect(countsInMonth(s, '2026-06')).toBe(true);
    expect(countsInMonth(s, '2026-07')).toBe(false);
  });
  it('única vale só no mês recebido', () => {
    expect(countsInMonth(thirteenth, '2026-12')).toBe(true);
    expect(countsInMonth(thirteenth, '2027-01')).toBe(false);
  });
});

describe('incomeForMonth', () => {
  it('separa renda regular de dinheiro extra', () => {
    const m = incomeForMonth([salary, thirteenth, freela], '2026-12');
    expect(m).toEqual({ totalCents: 830_000, regularCents: 580_000, extraCents: 250_000 });
  });
  it('mês sem receitas', () => {
    expect(incomeForMonth([thirteenth], '2026-11')).toEqual({ totalCents: 0, regularCents: 0, extraCents: 0 });
  });
});

describe('comprometimento', () => {
  it('parcelas sobre a renda regular', () => {
    expect(commitmentRatio(150_000, 500_000)).toBeCloseTo(0.3);
    expect(commitmentRatio(100, 0)).toBeNull();
  });
  it.each([
    [null, 'unknown'],
    [0.25, 'ok'],
    [0.3, 'ok'],
    [0.35, 'attention'],
    [0.5, 'risk'],
  ])('%s -> %s', (r, level) => expect(commitmentLevel(r as number | null)).toBe(level));
});
