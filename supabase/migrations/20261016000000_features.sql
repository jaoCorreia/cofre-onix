-- Empréstimos, investimentos/reserva, documentos (storage) e exclusão de conta.

-- ---------------------------------------------------------------- reserva de emergência
-- Gastos mensais do lar: base para "quantos meses a reserva cobre".
alter table public.households add column monthly_expenses_cents bigint check (monthly_expenses_cents >= 0);

-- ---------------------------------------------------------------- empréstimos
alter table public.loans add column notes text check (length(notes) <= 500);
alter table public.loans add column updated_at timestamptz not null default now();
alter table public.loans add constraint loans_paid_le_amount check (paid_cents <= amount_cents);

-- Registra um recebimento/pagamento parcial de empréstimo (RLS de quem chama vale).
create function public.register_loan_payment(loan_id uuid, value_cents bigint) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  if value_cents is null or value_cents <= 0 then raise exception 'valor deve ser positivo'; end if;
  update public.loans l
     set paid_cents = least(l.paid_cents + value_cents, l.amount_cents), updated_at = now()
   where l.id = loan_id;
  if not found then raise exception 'empréstimo não encontrado ou sem permissão'; end if;
end $$;
revoke all on function public.register_loan_payment from public, anon;
grant execute on function public.register_loan_payment to authenticated;

-- ---------------------------------------------------------------- investimentos
alter table public.investments add column monthly_rate numeric(10, 8) check (monthly_rate >= 0);
alter table public.investments add column updated_at timestamptz not null default now();

-- ---------------------------------------------------------------- documentos
alter table public.documents add column file_name text;
alter table public.documents add column mime_type text;
alter table public.documents add column size_bytes int check (size_bytes between 1 and 10485760);
create policy edit on public.documents for update using (app.can_write(household_id, owner_id, private))
  with check (app.can_write(household_id, owner_id, private));

-- Arquivos ficam em documents/<household_id>/<uuid>.<ext>, bucket privado.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "documents read" on storage.objects for select
  using (bucket_id = 'documents' and app.role_in(((storage.foldername(name))[1])::uuid) is not null);
create policy "documents add" on storage.objects for insert
  with check (bucket_id = 'documents' and app.role_in(((storage.foldername(name))[1])::uuid) in ('owner', 'editor'));
create policy "documents remove" on storage.objects for delete
  using (bucket_id = 'documents' and app.role_in(((storage.foldername(name))[1])::uuid) in ('owner', 'editor'));

-- ---------------------------------------------------------------- auditoria
-- Parcelas apagadas em cascata (junto com a dívida) não acham mais o lar: o registro
-- da dívida já cobre a ação, então a parcela é ignorada.
create or replace function app.audit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r jsonb := to_jsonb(coalesce(new, old));
  hh uuid := coalesce((r ->> 'household_id')::uuid,
                      (select household_id from public.debts where id = (r ->> 'debt_id')::uuid));
begin
  if hh is not null then
    insert into public.audit_log (household_id, actor, table_name, row_id, action)
    values (hh, auth.uid(), tg_table_name, coalesce(r ->> 'id', r ->> 'user_id')::uuid, lower(tg_op));
  end if;
  return coalesce(new, old);
end $$;

-- ---------------------------------------------------------------- exclusão de conta
-- Chamada pela Edge Function delete-account (service_role) antes de apagar o usuário do Auth.
-- Lares em que a pessoa é a única integrante são apagados; se houver outras pessoas e ela
-- for a única dona, o membro mais antigo vira dono. Itens privados dela são apagados.
create function app.delete_account_data(uid uuid) returns void
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
      delete from public.documents where household_id = h.household_id and owner_id = uid and private;
      delete from public.ai_saved where household_id = h.household_id and owner_id = uid and private;
      delete from public.household_members where household_id = h.household_id and user_id = uid;
    end if;
  end loop;
  delete from public.ai_usage where user_id = uid;
  delete from public.invites where created_by = uid;
end $$;
revoke all on function app.delete_account_data from public, anon, authenticated;
grant usage on schema app to service_role;
grant execute on function app.delete_account_data to service_role;

grant execute on function public.register_loan_payment to authenticated;

-- Invólucro em public para a Edge Function (o PostgREST só expõe o schema public).
create function public.delete_account_data(uid uuid) returns void
language sql security definer set search_path = '' as $$ select app.delete_account_data(uid) $$;
revoke all on function public.delete_account_data from public, anon, authenticated;
grant execute on function public.delete_account_data to service_role;
