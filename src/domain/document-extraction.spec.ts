import { describe, expect, it } from 'vitest';
import { normalizeExtraction } from './document-extraction';

describe('normalizeExtraction', () => {
  it('converte o JSON da IA para centavos, fração e data ISO', () => {
    const d = normalizeExtraction({
      kind: 'contract', creditor: 'Banco X', description: 'Financiamento veículo',
      amount: 38000, installments: 48, monthly_rate_percent: 2.1, system: 'price', first_due: '20/09/2025',
    });
    expect(d).toMatchObject({ kind: 'contract', amountCents: 3_800_000, installments: 48, system: 'price', firstDue: '2025-09-20' });
    expect(d.monthlyRate).toBeCloseTo(0.021);
    expect(d.uncertain).toEqual([]);
  });

  it('aceita valores como texto no formato brasileiro', () => {
    const d = normalizeExtraction({ amount: '1.240,55', monthly_rate_percent: '12,9' });
    expect(d.amountCents).toBe(124055);
    expect(d.monthlyRate).toBeCloseTo(0.129);
  });

  it('valores absurdos viram null e ficam marcados para conferência', () => {
    const d = normalizeExtraction({ amount: -5, installments: 9999, monthly_rate_percent: 300, first_due: '31/02/2025', system: 'xyz' });
    expect(d).toMatchObject({ amountCents: null, installments: null, monthlyRate: null, firstDue: null, system: null });
    expect(d.uncertain).toEqual(expect.arrayContaining(['amountCents', 'installments', 'monthlyRate', 'firstDue', 'system']));
  });

  it('respeita os campos que a própria IA marcou como incertos', () => {
    const d = normalizeExtraction({ creditor: 'Nubank', amount: 100, uncertain: ['creditor'] });
    expect(d.uncertain).toContain('creditor');
  });

  it('entrada inválida não quebra', () => {
    expect(normalizeExtraction(null).kind).toBe('other');
    expect(normalizeExtraction('texto').uncertain.length).toBeGreaterThan(0);
  });
});
