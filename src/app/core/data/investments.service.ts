import { Injectable, inject, signal } from '@angular/core';
import { supabase } from '../supabase';
import { HouseholdService } from './household.service';
import { Investment } from './models';

export interface InvestmentInput {
  name: string;
  kind: string;
  indexer: string;
  balanceCents: number;
  monthlyRate: number | null;
  isEmergencyReserve: boolean;
  icon: string;
  private: boolean;
}

@Injectable({ providedIn: 'root' })
export class InvestmentsService {
  private household = inject(HouseholdService);
  readonly investments = signal<Investment[]>([]);

  async load(): Promise<void> {
    const hh = this.household.currentId();
    if (!hh) return;
    const { data, error } = await supabase.from('investments').select('*').eq('household_id', hh).order('balance_cents', { ascending: false });
    if (error) throw error;
    this.investments.set((data as Investment[]).map((i) => ({ ...i, monthly_rate: i.monthly_rate === null ? null : Number(i.monthly_rate) })));
  }

  private row(input: InvestmentInput) {
    return {
      name: input.name,
      kind: input.kind,
      indexer: input.indexer || null,
      balance_cents: input.balanceCents,
      monthly_rate: input.monthlyRate,
      is_emergency_reserve: input.isEmergencyReserve,
      icon: input.icon,
      private: input.private,
      updated_at: new Date().toISOString(),
    };
  }

  async create(input: InvestmentInput): Promise<void> {
    const { error } = await supabase.from('investments').insert({ household_id: this.household.currentId(), ...this.row(input) });
    if (error) throw error;
    await this.load();
  }

  async update(id: string, input: InvestmentInput): Promise<void> {
    const { error } = await supabase.from('investments').update(this.row(input)).eq('id', id);
    if (error) throw error;
    await this.load();
  }

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('investments').delete().eq('id', id);
    if (error) throw error;
    await this.load();
  }
}
