import { Injectable, inject, signal } from '@angular/core';
import { IncomeCategory } from '../../../domain/income';
import { supabase } from '../supabase';
import { HouseholdService } from './household.service';
import { Income } from './models';

export interface IncomeInput {
  description: string;
  category: IncomeCategory;
  amountCents: number;
  receivedOn: string;
  recurring: boolean;
  icon: string;
  private: boolean;
}

@Injectable({ providedIn: 'root' })
export class IncomesService {
  private household = inject(HouseholdService);
  readonly incomes = signal<Income[]>([]);

  async load(): Promise<void> {
    const hh = this.household.currentId();
    if (!hh) return;
    const { data, error } = await supabase.from('incomes').select('*').eq('household_id', hh).order('received_on', { ascending: false });
    if (error) throw error;
    this.incomes.set(data as Income[]);
  }

  async create(input: IncomeInput): Promise<void> {
    const { error } = await supabase.from('incomes').insert({
      household_id: this.household.currentId(),
      description: input.description,
      category: input.category,
      amount_cents: input.amountCents,
      received_on: input.receivedOn,
      recurring: input.recurring,
      icon: input.icon,
      private: input.private,
    });
    if (error) throw error;
    await this.load();
  }

  /** Encerra uma receita recorrente (ex.: mudou de emprego) sem apagar o histórico. */
  async end(id: string, endedOn: string): Promise<void> {
    const { error } = await supabase.from('incomes').update({ ended_on: endedOn }).eq('id', id);
    if (error) throw error;
    await this.load();
  }

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('incomes').delete().eq('id', id);
    if (error) throw error;
    await this.load();
  }
}
