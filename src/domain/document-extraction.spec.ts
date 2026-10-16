import { describe, expect, it } from 'vitest';
import { excerptForExtraction, normalizeExtraction, parseJsonObject } from './document-extraction';

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

describe('parseJsonObject', () => {
  it.each([
    ['{"amount": 10}', { amount: 10 }],
    ['```json\n{"amount": 10}\n```', { amount: 10 }],
    ['Aqui está:\n{"kind":"boleto","amount":1.5}\nEspero ter ajudado', { kind: 'boleto', amount: 1.5 }],
  ])('lê %j', (txt, obj) => expect(parseJsonObject(txt)).toEqual(obj));

  it.each(['', null, 'sem json', '{"amount": 10', '[1,2]', '{quebrado}'])('devolve null para %j', (txt) => {
    expect(parseJsonObject(txt as string)).toBeNull();
  });
});

describe('excerptForExtraction', () => {
  it('texto curto vai inteiro', () => {
    expect(excerptForExtraction('Valor R$ 100', 500)).toBe('Valor R$ 100');
  });

  it('inclui trechos com palavras-chave que estão depois do começo', () => {
    const filler = 'cláusula genérica sem interesse. '.repeat(1500); // ~48 mil caracteres
    const text = 'RESUMO valor 4.636,83 ' + filler + ' Sistema de amortização: Tabela Price. ' + filler + ' 1º Vencimento: 07/11/2026 ' + filler;
    const out = excerptForExtraction(text);
    expect(out.length).toBeLessThanOrEqual(12_000);
    expect(out).toContain('RESUMO valor 4.636,83');
    expect(out).toContain('Tabela Price');
    expect(out).toContain('Vencimento: 07/11/2026');
  });

  it('respeita o limite mesmo com muitas palavras-chave', () => {
    const text = 'início '.repeat(2000) + 'parcela taxa juros vencimento '.repeat(5000);
    expect(excerptForExtraction(text).length).toBeLessThanOrEqual(12_000);
  });
});
