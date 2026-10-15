import Decimal from 'decimal.js';

/** Valores monetários sempre em centavos inteiros. */
export type Cents = number;
export type AmortizationSystem = 'price' | 'sac';

export interface Installment {
  n: number;
  payment: Cents;
  interest: Cents;
  amortization: Cents;
  balance: Cents;
}

function assertLoan(principal: Cents, monthlyRate: number, n: number): void {
  if (!Number.isInteger(principal) || principal < 0) throw new RangeError('principal deve ser centavos inteiros >= 0');
  if (!Number.isFinite(monthlyRate) || monthlyRate < 0) throw new RangeError('taxa deve ser >= 0');
  if (!Number.isInteger(n) || n < 1) throw new RangeError('número de parcelas deve ser inteiro >= 1');
}

const roundCents = (d: Decimal): Cents => d.toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN).toNumber();

/** Parcela fixa da tabela Price, em centavos. */
export function pricePayment(principal: Cents, monthlyRate: number, n: number): Cents {
  assertLoan(principal, monthlyRate, n);
  if (monthlyRate === 0) return Math.ceil(principal / n);
  const i = new Decimal(monthlyRate);
  const factor = i.div(new Decimal(1).minus(i.plus(1).pow(-n)));
  return roundCents(factor.times(principal));
}

/**
 * Monta a tabela linha a linha; a última parcela absorve o arredondamento
 * para o saldo terminar exatamente em zero.
 */
function build(principal: Cents, monthlyRate: number, n: number, amortFor: (k: number, balance: Cents, interest: Cents) => Cents): Installment[] {
  const rows: Installment[] = [];
  let balance = principal;
  for (let k = 1; k <= n; k++) {
    const interest = roundCents(new Decimal(balance).times(monthlyRate));
    let amortization = k === n ? balance : Math.min(balance, Math.max(0, amortFor(k, balance, interest)));
    balance -= amortization;
    rows.push({ n: k, payment: interest + amortization, interest, amortization, balance });
    if (balance === 0 && k < n) break;
  }
  return rows;
}

export function priceSchedule(principal: Cents, monthlyRate: number, n: number): Installment[] {
  const payment = pricePayment(principal, monthlyRate, n);
  return build(principal, monthlyRate, n, (_k, _b, interest) => payment - interest);
}

export function sacSchedule(principal: Cents, monthlyRate: number, n: number): Installment[] {
  assertLoan(principal, monthlyRate, n);
  const base = Math.floor(principal / n);
  const rest = principal - base * n;
  // Os centavos que sobram da divisão vão nas primeiras parcelas.
  return build(principal, monthlyRate, n, (k) => base + (k <= rest ? 1 : 0));
}

export function schedule(system: AmortizationSystem, principal: Cents, monthlyRate: number, n: number): Installment[] {
  return system === 'price' ? priceSchedule(principal, monthlyRate, n) : sacSchedule(principal, monthlyRate, n);
}

export const totalInterest = (rows: Installment[]): Cents => rows.reduce((s, r) => s + r.interest, 0);
