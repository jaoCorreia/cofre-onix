import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { evaluateFormula, validateChart, validateFormula } from './ai-tools';

describe('validateChart', () => {
  const ok = { kind: 'bar', title: 'Dívidas', labels: ['jan', 'fev'], series: [{ name: 'Saldo', values: [10, 20] }], unit: 'brl' };

  it('aceita um gráfico válido', () => {
    expect(validateChart(ok).ok).toBe(true);
  });

  it.each([
    ['tipo desconhecido', { ...ok, kind: 'scatter3d' }],
    ['valores a menos', { ...ok, series: [{ name: 'S', values: [1] }] }],
    ['valor não numérico', { ...ok, series: [{ name: 'S', values: [1, 'x'] }] }],
    ['NaN', { ...ok, series: [{ name: 'S', values: [1, NaN] }] }],
    ['pizza com duas séries', { ...ok, kind: 'pie', series: [{ name: 'a', values: [1, 2] }, { name: 'b', values: [1, 2] }] }],
    ['pizza negativa', { ...ok, kind: 'pie', series: [{ name: 'a', values: [1, -2] }] }],
    ['sem título', { ...ok, title: ' ' }],
    ['muitos pontos', { ...ok, labels: Array(61).fill('x'), series: [{ name: 's', values: Array(61).fill(1) }] }],
  ])('rejeita %s', (_n, spec) => {
    expect(validateChart(spec).ok).toBe(false);
  });

  it('não deixa passar campos extras (ex.: html/script)', () => {
    const r = validateChart({ ...ok, html: '<script>alert(1)</script>' });
    expect(r.ok && 'html' in r.chart).toBe(false);
  });
});

describe('fórmulas', () => {
  const vars = ['divida_total', 'parcelas_mes', 'renda'];

  it.each([
    ['1 + 2 * 3', 7],
    ['(1 + 2) * 3', 9],
    ['2 ^ 3 ^ 2', 512],
    ['-3 + 5', 2],
    ['10 / 4', 2.5],
    ['max(1; 7; 3)', 7],
    ['round(2,345; 2)', 2.35],
    ['parcelas_mes / renda * 100', 25],
  ])('%s = %d', (expr, expected) => {
    expect(evaluateFormula(expr, { divida_total: 1000, parcelas_mes: 500, renda: 2000 })).toBeCloseTo(expected);
  });

  it.each([
    ['chamada de código', 'constructor.constructor("alert(1)")()'],
    ['acesso a propriedade', 'window.location'],
    ['string', '"abc"'],
    ['colchetes', 'a[0]'],
    ['variável desconhecida', 'salario * 2'],
    ['parênteses abertos', '(1 + 2'],
    ['operadores seguidos', '1 + * 2'],
    ['vazia', '   '],
    ['muito longa', '1+'.repeat(150) + '1'],
  ])('rejeita %s', (_n, expr) => {
    expect(validateFormula(expr, vars).ok).toBe(false);
  });

  it('divisão por zero vira erro, não Infinity', () => {
    expect(() => evaluateFormula('1 / 0', {})).toThrow();
  });

  it('nunca lança nada além de Error, para qualquer texto', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 60 }), (s) => {
        const r = validateFormula(s, vars);
        expect(typeof r.ok).toBe('boolean');
      }),
    );
  });
});
