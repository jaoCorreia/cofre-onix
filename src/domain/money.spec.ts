import { describe, expect, it } from 'vitest';
import { addMonths, formatBRL, formatBRLCompact, parseBRL, parsePercent } from './money';

describe('formatBRL', () => {
  it('formata centavos', () => {
    expect(formatBRL(123456)).toBe('R$ 1.234,56');
    expect(formatBRL(0)).toBe('R$ 0,00');
  });
});

describe('parseBRL', () => {
  it.each([
    ['1.234,56', 123456],
    ['1234,5', 123450],
    ['R$ 10', 1000],
    ['10.5', 1050],
    ['38.000', 3800000],
    ['38.000,00', 3800000],
    ['0,01', 1],
  ])('%s -> %i', (txt, cents) => expect(parseBRL(txt)).toBe(cents));

  it('rejeita texto', () => {
    expect(parseBRL('abc')).toBeNull();
    expect(parseBRL('')).toBeNull();
  });
});

describe('parsePercent', () => {
  it('converte para fração', () => {
    expect(parsePercent('2,1')).toBeCloseTo(0.021);
    expect(parsePercent('12.9%')).toBeCloseTo(0.129);
    expect(parsePercent('-1')).toBeNull();
  });
});

describe('addMonths', () => {
  it('mantém o dia ou usa o último dia do mês', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-10-20', 3)).toBe('2027-01-20');
  });
});

describe('formatBRLCompact', () => {
  it.each([
    [95000, 'R$ 950,00'],
    [3608909, 'R$ 36,1 mil'],
    [-1638909, '-R$ 16,4 mil'],
    [123456789, 'R$ 1,2 mi'],
  ])('%i -> %s', (c, txt) => expect(formatBRLCompact(c)).toBe(txt));
});
