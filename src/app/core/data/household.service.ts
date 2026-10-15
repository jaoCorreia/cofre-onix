import { Injectable, computed, signal } from '@angular/core';
import { supabase } from '../supabase';
import { Household, Member, Role } from './models';

const CURRENT_KEY = 'cofre.household';

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
      .select('role, households(id, name)')
      .eq('user_id', uid ?? '');
    if (error) throw error;

    const list = (data ?? []).flatMap((r: { role: Role; households: { id: string; name: string } | { id: string; name: string }[] | null }) => {
      const h = Array.isArray(r.households) ? r.households[0] : r.households;
      return h ? [{ id: h.id, name: h.name, role: r.role }] : [];
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
    return `${location.origin}/convite/${data}`;
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

  clear(): void {
    this.households.set([]);
    this.currentId.set(null);
  }
}
