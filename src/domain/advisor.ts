import { AmortizationSystem, Cents } from './amortization';
import { simulatePrepayment } from './prepayment';

export interface Debt {
  id: string;
  name: string;
  balance: Cents;
  monthlyRate: number;
  remaining: number;
  system: AmortizationSystem;
}

export interface AdviceInput {
  extra: Cents;
  reserveMonths: number;
  /** Rendimento mensal líquido de IR da aplicação alternativa. */
  investmentNetMonthlyRate: number;
  debts: Debt[];
}

export const MIN_RESERVE_MONTHS = 3;

export type Advice =
  | { action: 'build_reserve'; reserveMonths: number }
  | { action: 'invest' }
  | { action: 'keep_invested'; debtId: string; debtRate: number; investmentRate: number }
  | { action: 'prepay'; debtId: string; mode: 'reduce_term' | 'reduce_payment'; amount: Cents; interestSaved: Cents };

/**
 * Regras, em ordem: reserva de emergência, método avalanche (maior taxa
 * primeiro) e custo de oportunidade contra o investimento.
 */
export function adviseExtraMoney(input: AdviceInput): Advice {
  if (input.reserveMonths < MIN_RESERVE_MONTHS) return { action: 'build_reserve', reserveMonths: input.reserveMonths };

  const open = input.debts.filter((d) => d.balance > 0);
  if (open.length === 0) return { action: 'invest' };

  const target = [...open].sort((a, b) => b.monthlyRate - a.monthlyRate)[0];
  if (target.monthlyRate <= input.investmentNetMonthlyRate) {
    return { action: 'keep_invested', debtId: target.id, debtRate: target.monthlyRate, investmentRate: input.investmentNetMonthlyRate };
  }

  const amount = Math.min(input.extra, target.balance);
  const sim = simulatePrepayment({ ...target, extra: amount });
  const termWins = sim.reduceTerm.interestSaved >= sim.reducePayment.interestSaved;
  return {
    action: 'prepay',
    debtId: target.id,
    mode: termWins ? 'reduce_term' : 'reduce_payment',
    amount,
    interestSaved: termWins ? sim.reduceTerm.interestSaved : sim.reducePayment.interestSaved,
  };
}
