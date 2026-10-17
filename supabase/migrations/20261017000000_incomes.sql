-- Receitas: quanto o lar recebeu (salário, 13º, extras), únicas ou recorrentes todo mês.
create table public.incomes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  owner_id uuid not null default auth.uid(),
  private boolean not null default false,
  description text not null check (length(description) between 1 and 120),
  category text not null check (category in ('salary', 'thirteenth', 'vacation', 'freelance', 'rent', 'tax_refund', 'bonus', 'other')),
  amount_cents bigint not null check (amount_cents > 0),
  received_on date not null,
  -- Recorrente: vale todo mês a partir de received_on (até ended_on, se informado).
  recurring boolean not null default false,
  ended_on date check (ended_on is null or ended_on >= received_on),
  icon text,
  created_at timestamptz not null default now()
);
create index incomes_household_date on public.incomes (household_id, received_on);

alter table public.incomes enable row level security;
create policy read on public.incomes for select using (app.can_read(household_id, owner_id, private));
create policy add on public.incomes for insert with check (owner_id = auth.uid() and app.can_write(household_id, owner_id, private));
create policy edit on public.incomes for update using (app.can_write(household_id, owner_id, private))
  with check (app.can_write(household_id, owner_id, private));
create policy remove on public.incomes for delete using (app.can_write(household_id, owner_id, private));
create trigger audit after insert or update or delete on public.incomes for each row execute function app.audit();
grant select, insert, update, delete on public.incomes to authenticated;

-- Exclusão de conta também apaga receitas privadas.
create or replace function app.delete_account_data(uid uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare h record;
begin
  for h in select household_id from public.household_members where user_id = uid loop
    if not exists (select 1 from public.household_members where household_id = h.household_id and user_id <> uid) then
      delete from public.households where id = h.household_id;
      delete from public.audit_log where household_id = h.household_id;
    else
      if not exists (select 1 from public.household_members
                     where household_id = h.household_id and user_id <> uid and role = 'owner') then
        update public.household_members set role = 'owner'
         where (household_id, user_id) = (
           select household_id, user_id from public.household_members
            where household_id = h.household_id and user_id <> uid order by joined_at limit 1);
      end if;
      delete from public.debts where household_id = h.household_id and owner_id = uid and private;
      delete from public.loans where household_id = h.household_id and owner_id = uid and private;
      delete from public.investments where household_id = h.household_id and owner_id = uid and private;
      delete from public.incomes where household_id = h.household_id and owner_id = uid and private;
      delete from public.documents where household_id = h.household_id and owner_id = uid and private;
      delete from public.ai_saved where household_id = h.household_id and owner_id = uid and private;
      delete from public.household_members where household_id = h.household_id and user_id = uid;
    end if;
  end loop;
  delete from public.ai_usage where user_id = uid;
  delete from public.invites where created_by = uid;
end $$;
