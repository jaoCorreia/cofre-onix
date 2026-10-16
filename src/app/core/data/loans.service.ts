import { Injectable, inject, signal } from '@angular/core';
import { supabase } from '../supabase';
import { HouseholdService } from './household.service';
import { Loan } from './models';

export interface NewLoan {
  counterparty: string;
  direction: 'lent' | 'borrowed';
  amountCents: number;
  monthlyRate: number;
  dueDate: string | null;
  icon: string;
  notes: string;
  private: boolean;
}

@Injectable({ providedIn: 'root' })
export class LoansService {
  private household = inject(HouseholdService);
  readonly loans = signal<Loan[]>([]);

  async load(): Promise<void> {
    const hh = this.household.currentId();
    if (!hh) return;
    const { data, error } = await supabase.from('loans').select('*').eq('household_id', hh).order('due_date', { nullsFirst: false });
    if (error) throw error;
    this.loans.set((data as Loan[]).map((l) => ({ ...l, monthly_rate: Number(l.monthly_rate) })));
  }

  async create(input: NewLoan): Promise<void> {
    const { error } = await supabase.from('loans').insert({
      household_id: this.household.currentId(),
      counterparty: input.counterparty,
      direction: input.direction,
      amount_cents: input.amountCents,
      monthly_rate: input.monthlyRate,
      due_date: input.dueDate,
      icon: input.icon,
      notes: input.notes || null,
      private: input.private,
    });
    if (error) throw error;
    await this.load();
  }

  async registerPayment(loanId: string, cents: number): Promise<void> {
    const { error } = await supabase.rpc('register_loan_payment', { loan_id: loanId, value_cents: cents });
    if (error) throw error;
    await this.load();
  }

  async remove(loanId: string): Promise<void> {
    const { error } = await supabase.from('loans').delete().eq('id', loanId);
    if (error) throw error;
    await this.load();
  }
}
