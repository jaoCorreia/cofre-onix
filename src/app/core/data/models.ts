import type { AmortizationSystem, Cents } from '../../../domain/amortization';

export type Role = 'owner' | 'editor' | 'viewer';

export interface Household {
  id: string;
  name: string;
  role: Role;
}

export interface Member {
  user_id: string;
  role: Role;
  joined_at: string;
  email: string | null;
}

export interface Debt {
  id: string;
  household_id: string;
  owner_id: string;
  private: boolean;
  name: string;
  creditor: string | null;
  icon: string | null;
  principal_cents: Cents;
  balance_cents: Cents;
  monthly_rate: number;
  system: AmortizationSystem;
  installments: number;
  first_due: string | null;
}

export interface InstallmentRow {
  id: string;
  debt_id: string;
  n: number;
  due_date: string | null;
  payment_cents: Cents;
  interest_cents: Cents;
  amortization_cents: Cents;
  paid_at: string | null;
}

export interface NewDebt {
  name: string;
  creditor: string;
  icon: string;
  principalCents: Cents;
  monthlyRate: number;
  system: AmortizationSystem;
  installments: number;
  firstDue: string;
  /** Parcelas já pagas antes do cadastro. */
  alreadyPaid: number;
  private: boolean;
}
