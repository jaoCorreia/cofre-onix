import type { AmortizationSystem, Cents } from '../../../domain/amortization';
import type { IncomeCategory } from '../../../domain/income';

export type Role = 'owner' | 'editor' | 'viewer';

export interface Household {
  id: string;
  name: string;
  role: Role;
  monthlyExpensesCents: Cents | null;
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

export interface Loan {
  id: string;
  household_id: string;
  owner_id: string;
  private: boolean;
  counterparty: string;
  direction: 'lent' | 'borrowed';
  amount_cents: Cents;
  paid_cents: Cents;
  monthly_rate: number;
  due_date: string | null;
  icon: string | null;
  notes: string | null;
  created_at: string;
}

export interface Investment {
  id: string;
  household_id: string;
  owner_id: string;
  private: boolean;
  name: string;
  kind: string;
  indexer: string | null;
  balance_cents: Cents;
  monthly_rate: number | null;
  is_emergency_reserve: boolean;
  icon: string | null;
}

export interface DocumentRow {
  id: string;
  household_id: string;
  storage_path: string;
  kind: 'invoice' | 'contract' | 'boleto' | 'other';
  sha256: string;
  debt_id: string | null;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
}

export interface Income {
  id: string;
  household_id: string;
  owner_id: string;
  private: boolean;
  description: string;
  category: IncomeCategory;
  amount_cents: Cents;
  received_on: string;
  recurring: boolean;
  ended_on: string | null;
  icon: string | null;
}
