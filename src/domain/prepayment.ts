import { AmortizationSystem, Cents, Installment, schedule, totalInterest } from './amortization';

export interface PrepaymentInput {
  balance: Cents;
  monthlyRate: number;
  remaining: number;
  extra: Cents;
  system: AmortizationSystem;
}

export interface PrepaymentResult {
  currentPayment: Cents;
  currentInterest: Cents;
  /** Mantém a parcela e encurta o prazo. */
  reduceTerm: { remaining: number; interestSaved: Cents };
  /** Mantém o prazo e diminui a parcela. */
  reducePayment: { payment: Cents; interestSaved: Cents };
}

/** Menor prazo cuja primeira parcela não passa da parcela atual. */
function shortestTermWithin(balance: Cents, input: PrepaymentInput, maxPayment: Cents): Installment[] {
  let lo = 1;
  let hi = input.remaining;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (schedule(input.system, balance, input.monthlyRate, mid)[0].payment <= maxPayment) hi = mid;
    else lo = mid + 1;
  }
  return schedule(input.system, balance, input.monthlyRate, lo);
}

export function simulatePrepayment(input: PrepaymentInput): PrepaymentResult {
  const { balance, monthlyRate, remaining, extra, system } = input;
  if (!Number.isInteger(extra) || extra < 0 || extra > balance) throw new RangeError('extra deve estar entre 0 e o saldo');

  const current = schedule(system, balance, monthlyRate, remaining);
  const currentInterest = totalInterest(current);
  const currentPayment = current[0].payment;
  const left = balance - extra;

  if (left === 0) {
    return {
      currentPayment,
      currentInterest,
      reduceTerm: { remaining: 0, interestSaved: currentInterest },
      reducePayment: { payment: 0, interestSaved: currentInterest },
    };
  }

  const shorter = shortestTermWithin(left, input, currentPayment);
  const lower = schedule(system, left, monthlyRate, remaining);
  return {
    currentPayment,
    currentInterest,
    reduceTerm: { remaining: shorter.length, interestSaved: Math.max(0, currentInterest - totalInterest(shorter)) },
    reducePayment: { payment: lower[0].payment, interestSaved: Math.max(0, currentInterest - totalInterest(lower)) },
  };
}
