import { Injectable, computed, signal } from '@angular/core';
import { supabase } from '../supabase';
import { Household, Member, Role } from './models';

const CURRENT_KEY = 'cofre.household';
export const PUBLIC_APP_URL = 'https://jaocorreia.github.io/cofre-onix/app/';

@Injectable({ providedIn: 'root' })
export class HouseholdService {
  readonly households = signal<Household[]>([]);
  readonly currentId = signal<string | null>(null);
  readonly current = computed(() => this.households().find((h) => h.id === this.currentId()) ?? null);
  readonly canEdit = computed(() => ['owner', 'editor'].includes(this.current()?.role ?? ''));
  readonly isOwner = computed(() => this.current()?.role === 'owner');

  async load(): Promise<Household[]> {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    const { data, error } = await supabase
      .from('household_members')
      .select('role, households(id, name, monthly_expenses_cents)')
      .eq('user_id', uid ?? '');
    if (error) throw error;

    type Row = { id: string; name: string; monthly_expenses_cents: number | null };
    const list = (data ?? []).flatMap((r: { role: Role; households: Row | Row[] | null }) => {
      const h = Array.isArray(r.households) ? r.households[0] : r.households;
      return h ? [{ id: h.id, name: h.name, role: r.role, monthlyExpensesCents: h.monthly_expenses_cents }] : [];
    });
    this.households.set(list);

    const saved = localStorage.getItem(CURRENT_KEY);
    this.currentId.set(list.find((h) => h.id === saved)?.id ?? list[0]?.id ?? null);
    return list;
  }

  select(id: string): void {
    this.currentId.set(id);
    localStorage.setItem(CURRENT_KEY, id);
  }

  async create(name: string): Promise<string> {
    const { data, error } = await supabase.rpc('create_household', { household_name: name });
    if (error) throw error;
    await this.load();
    this.select(data as string);
    return data as string;
  }

  async members(): Promise<Member[]> {
    const { data, error } = await supabase
      .from('household_members')
      .select('user_id, role, joined_at, email')
      .eq('household_id', this.currentId() ?? '')
      .order('joined_at');
    if (error) throw error;
    return data as Member[];
  }

  /** Devolve o link de convite (o token só existe aqui; o banco guarda o hash). */
  async invite(email: string, role: Exclude<Role, 'owner'>): Promise<string> {
    const { data, error } = await supabase.rpc('create_invite', { hh: this.currentId(), invite_email: email, invite_role: role });
    if (error) throw error;
    // Link público (versão web): abre no navegador de qualquer pessoa, inclusive a partir do celular.
    return `${PUBLIC_APP_URL}#/convite/${data}`;
  }

  async acceptInvite(token: string): Promise<void> {
    const { data, error } = await supabase.rpc('accept_invite', { token });
    if (error) throw error;
    await this.load();
    this.select(data as string);
  }

  async removeMember(userId: string): Promise<void> {
    const { error } = await supabase.from('household_members').delete().eq('household_id', this.currentId() ?? '').eq('user_id', userId);
    if (error) throw error;
  }

  /** Gastos mensais do lar (base da reserva de emergência). Só o dono altera. */
  async setMonthlyExpenses(cents: number | null): Promise<void> {
    const { error } = await supabase.from('households').update({ monthly_expenses_cents: cents }).eq('id', this.currentId() ?? '');
    if (error) throw error;
    this.households.update((list) => list.map((h) => (h.id === this.currentId() ? { ...h, monthlyExpensesCents: cents } : h)));
  }

  clear(): void {
    this.households.set([]);
    this.currentId.set(null);
  }
}
