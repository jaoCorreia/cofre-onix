import { Injectable, inject, signal } from '@angular/core';
import { schedule } from '../../../domain/amortization';
import { addMonths } from '../../../domain/money';
import { supabase } from '../supabase';
import { HouseholdService } from './household.service';
import { Debt, InstallmentRow, NewDebt } from './models';

@Injectable({ providedIn: 'root' })
export class DebtsService {
  private household = inject(HouseholdService);
  readonly debts = signal<(Debt & { remaining: number })[]>([]);
  readonly upcoming = signal<(InstallmentRow & { debt_name: string })[]>([]);

  async load(): Promise<void> {
    const hh = this.household.currentId();
    if (!hh) return;
    const { data, error } = await supabase.from('debts').select('*').eq('household_id', hh).order('monthly_rate', { ascending: false });
    if (error) throw error;
    const list = data as Debt[];
    const ids = list.map((d) => d.id);
    if (ids.length === 0) {
      this.debts.set([]);
      return this.upcoming.set([]);
    }

    // Parcelas em aberto por dívida (o simulador precisa do prazo restante).
    const { data: open, error: e1 } = await supabase.from('installments').select('debt_id').in('debt_id', ids).is('paid_at', null);
    if (e1) throw e1;
    const remaining = new Map<string, number>();
    for (const r of open as { debt_id: string }[]) remaining.set(r.debt_id, (remaining.get(r.debt_id) ?? 0) + 1);
    this.debts.set(list.map((d) => ({ ...d, monthly_rate: Number(d.monthly_rate), remaining: remaining.get(d.id) ?? 0 })));
    const { data: inst, error: e2 } = await supabase
      .from('installments')
      .select('*')
      .in('debt_id', ids)
      .is('paid_at', null)
      .order('due_date')
      .limit(5);
    if (e2) throw e2;
    const names = new Map(list.map((d) => [d.id, d.name]));
    this.upcoming.set((inst as InstallmentRow[]).map((i) => ({ ...i, debt_name: names.get(i.debt_id) ?? '' })));
  }

  /** Cria a dívida e gera todas as parcelas pelo motor (Price/SAC). */
  async create(input: NewDebt): Promise<string> {
    const rows = schedule(input.system, input.principalCents, input.monthlyRate, input.installments);
    const paid = rows.slice(0, input.alreadyPaid);
    const balance = input.principalCents - paid.reduce((s, r) => s + r.amortization, 0);

    const { data, error } = await supabase
      .from('debts')
      .insert({
        household_id: this.household.currentId(),
        name: input.name,
        creditor: input.creditor || null,
        icon: input.icon,
        principal_cents: input.principalCents,
        balance_cents: balance,
        monthly_rate: input.monthlyRate,
        system: input.system,
        installments: input.installments,
        first_due: input.firstDue,
        private: input.private,
      })
      .select('id')
      .single();
    if (error) throw error;

    const now = new Date().toISOString();
    const { error: e2 } = await supabase.from('installments').insert(
      rows.map((r) => ({
        debt_id: data.id,
        n: r.n,
        due_date: addMonths(input.firstDue, r.n - 1),
        payment_cents: r.payment,
        interest_cents: r.interest,
        amortization_cents: r.amortization,
        paid_at: r.n <= input.alreadyPaid ? now : null,
      })),
    );
    if (e2) {
      await supabase.from('debts').delete().eq('id', data.id); // não deixa dívida sem parcelas
      throw e2;
    }
    await this.load();
    return data.id;
  }

  async installments(debtId: string): Promise<InstallmentRow[]> {
    const { data, error } = await supabase.from('installments').select('*').eq('debt_id', debtId).order('n');
    if (error) throw error;
    return data as InstallmentRow[];
  }

  async setPaid(installmentId: string, paid: boolean): Promise<void> {
    const { error } = await supabase.rpc('set_installment_paid', { installment_id: installmentId, paid });
    if (error) throw error;
    await this.load();
  }

  async remove(debtId: string): Promise<void> {
    const { error } = await supabase.from('debts').delete().eq('id', debtId);
    if (error) throw error;
    await this.load();
  }
}
