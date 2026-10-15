import { Cents } from './amortization';

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function formatBRL(cents: Cents): string {
  return brl.format(cents / 100).replace(/ /g, ' ');
}

/** Aceita "1.234,56", "1234,5", "R$ 10", "10.5". Retorna null se não for um valor válido. */
export function parseBRL(input: string): Cents | null {
  let s = input.replace(/R\$|\s/g, '');
  if (!/^-?[\d.,]+$/.test(s)) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.'); // formato BR: 1.234,56
  else if (!/^-?\d+\.\d{1,2}$/.test(s)) s = s.replace(/\./g, ''); // pontos de milhar: 38.000
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

/** "2,1" -> 0.021 (percentual ao mês para fração). */
export function parsePercent(input: string): number | null {
  const n = Number(input.replace('%', '').trim().replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n / 100 : null;
}

export function formatPercent(rate: number, digits = 2): string {
  return `${(rate * 100).toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
}

/** Soma meses a uma data ISO (yyyy-mm-dd), mantendo o dia quando existe no mês. */
export function addMonths(isoDate: string, months: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}
