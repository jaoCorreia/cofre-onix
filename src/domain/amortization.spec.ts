import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { priceSchedule, sacSchedule, totalInterest } from './amortization';
import { simulatePrepayment } from './prepayment';

describe('priceSchedule', () => {
  it('bate com a tabela de referência (R$ 10.000, 1% a.m., 12x)', () => {
    const rows = priceSchedule(1_000_000, 0.01, 12);
    expect(rows).toHaveLength(12);
    expect(rows[0]).toEqual({ n: 1, payment: 88_849, interest: 10_000, amortization: 78_849, balance: 921_151 });
    expect(rows[11].balance).toBe(0);
    // Valor exato sem arredondar: R$ 661,855. Como os juros são arredondados mês a mês, fecha em 661,86.
    expect(totalInterest(rows)).toBe(66_186);
  });

  it('com juro zero divide o principal igualmente', () => {
    const rows = priceSchedule(120_000, 0, 12);
    expect(rows.every((r) => r.payment === 10_000 && r.interest === 0)).toBe(true);
  });

  it('rejeita entradas inválidas', () => {
    expect(() => priceSchedule(-1, 0.01, 12)).toThrow();
    expect(() => priceSchedule(1000, 0.01, 0)).toThrow();
    expect(() => priceSchedule(1000.5, 0.01, 2)).toThrow();
  });
});

describe('sacSchedule', () => {
  it('amortização constante e parcelas decrescentes (R$ 12.000, 1% a.m., 12x)', () => {
    const rows = sacSchedule(1_200_000, 0.01, 12);
    expect(rows[0]).toEqual({ n: 1, payment: 112_000, interest: 12_000, amortization: 100_000, balance: 1_100_000 });
    expect(rows[11].payment).toBe(101_000);
    expect(totalInterest(rows)).toBe(78_000);
  });
});

const loanArb = fc.record({
  principal: fc.integer({ min: 100, max: 100_000_000 }),
  rate: fc.double({ min: 0, max: 0.15, noNaN: true }),
  n: fc.integer({ min: 1, max: 420 }),
});

describe.each([
  ['Price', priceSchedule],
  ['SAC', sacSchedule],
])('invariantes %s', (_name, schedule) => {
  it('soma das amortizações = principal, saldo final 0, valores inteiros', () => {
    fc.assert(
      fc.property(loanArb, ({ principal, rate, n }) => {
        const rows = schedule(principal, rate, n);
        expect(rows.reduce((s, r) => s + r.amortization, 0)).toBe(principal);
        expect(rows.at(-1)!.balance).toBe(0);
        for (const r of rows) {
          expect(Number.isInteger(r.payment) && Number.isInteger(r.interest)).toBe(true);
          expect(r.payment).toBe(r.interest + r.amortization);
          expect(r.balance).toBeGreaterThanOrEqual(0);
        }
      }),
    );
  });
});

describe('simulatePrepayment', () => {
  it('cenário do carro: reduzir prazo economiza mais que reduzir parcela', () => {
    const r = simulatePrepayment({ balance: 2_740_000, monthlyRate: 0.021, remaining: 34, extra: 300_000, system: 'price' });
    expect(r.reduceTerm.interestSaved).toBeGreaterThan(r.reducePayment.interestSaved);
    expect(r.reduceTerm.remaining).toBeLessThan(34);
    expect(r.reducePayment.payment).toBeLessThan(r.currentPayment);
  });

  it('amortizar nunca aumenta o juro total', () => {
    fc.assert(
      fc.property(loanArb, fc.double({ min: 0, max: 0.99, noNaN: true }), ({ principal, rate, n }, frac) => {
        const extra = Math.floor(principal * frac);
        const r = simulatePrepayment({ balance: principal, monthlyRate: rate, remaining: n, extra, system: 'price' });
        expect(r.reduceTerm.interestSaved).toBeGreaterThanOrEqual(0);
        expect(r.reducePayment.interestSaved).toBeGreaterThanOrEqual(0);
      }),
    );
  });

  it('valor extra igual ao saldo quita a dívida', () => {
    const r = simulatePrepayment({ balance: 50_000, monthlyRate: 0.02, remaining: 10, extra: 50_000, system: 'sac' });
    expect(r.reduceTerm.remaining).toBe(0);
    expect(r.reduceTerm.interestSaved).toBe(r.currentInterest);
  });

  it('rejeita extra negativo ou maior que o saldo', () => {
    expect(() => simulatePrepayment({ balance: 1000, monthlyRate: 0.01, remaining: 5, extra: -1, system: 'price' })).toThrow();
    expect(() => simulatePrepayment({ balance: 1000, monthlyRate: 0.01, remaining: 5, extra: 1001, system: 'price' })).toThrow();
  });
});
