-- Cofre Ônix: núcleo do banco.
-- Todo dado pertence a um "lar" (household). O acesso é decidido no banco via RLS:
--   owner  -> tudo, inclusive convidar e remover membros
--   editor -> lê e grava lançamentos
--   viewer -> só lê
-- Itens marcados como private só são vistos e alterados por quem os criou.
-- Dinheiro sempre em centavos (bigint).

create schema if not exists app;

-- ---------------------------------------------------------------- lares
create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 80),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null,
  role text not null check (role in ('owner', 'editor', 'viewer')),
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  email text not null check (email = lower(email)),
  role text not null check (role in ('editor', 'viewer')),
  token_hash text not null unique,
  created_by uuid not null default auth.uid(),
  expires_at timestamptz not null default now() + interval '48 hours',
  accepted_at timestamptz
);

-- ---------------------------------------------------------------- funções de acesso
-- security definer para ler household_members sem recursão de RLS.
create function app.role_in(hh uuid) returns text
language sql stable security definer set search_path = '' as $$
  select role from public.household_members where household_id = hh and user_id = auth.uid()
$$;

create function app.can_read(hh uuid, owner uuid, is_private boolean) returns boolean
language sql stable set search_path = '' as $$
  select app.role_in(hh) is not null and (not is_private or owner = auth.uid())
$$;

create function app.can_write(hh uuid, owner uuid, is_private boolean) returns boolean
language sql stable set search_path = '' as $$
  select coalesce(app.role_in(hh) in ('owner', 'editor'), false) and (not is_private or owner = auth.uid())
$$;

-- ---------------------------------------------------------------- dados financeiros
create table public.debts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  owner_id uuid not null default auth.uid(),
  private boolean not null default false,
  name text not null check (length(name) between 1 and 120),
  creditor text,
  icon text,
  principal_cents bigint not null check (principal_cents >= 0),
  balance_cents bigint not null check (balance_cents >= 0),
  monthly_rate numeric(10, 8) not null check (monthly_rate >= 0),
  system text not null check (system in ('price', 'sac')),
  installments int not null check (installments > 0),
  first_due date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.installments (
  id uuid primary key default gen_random_uuid(),
  debt_id uuid not null references public.debts(id) on delete cascade,
  n int not null check (n > 0),
  due_date date,
  payment_cents bigint not null check (payment_cents >= 0),
  interest_cents bigint not null check (interest_cents >= 0),
  amortization_cents bigint not null check (amortization_cents >= 0),
  paid_at timestamptz,
  unique (debt_id, n)
);

create table public.loans (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  owner_id uuid not null default auth.uid(),
  private boolean not null default false,
  counterparty text not null,
  direction text not null check (direction in ('lent', 'borrowed')),
  amount_cents bigint not null check (amount_cents > 0),
  paid_cents bigint not null default 0 check (paid_cents >= 0),
  monthly_rate numeric(10, 8) not null default 0 check (monthly_rate >= 0),
  due_date date,
  icon text,
  created_at timestamptz not null default now()
);

create table public.investments (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  owner_id uuid not null default auth.uid(),
  private boolean not null default false,
  name text not null,
  kind text not null,
  indexer text,
  balance_cents bigint not null default 0 check (balance_cents >= 0),
  is_emergency_reserve boolean not null default false,
  icon text,
  created_at timestamptz not null default now()
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  owner_id uuid not null default auth.uid(),
  private boolean not null default false,
  storage_path text not null,
  kind text not null check (kind in ('invoice', 'contract', 'boleto', 'other')),
  sha256 text not null,
  debt_id uuid references public.debts(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (household_id, sha256)
);

-- ---------------------------------------------------------------- auditoria
create table public.audit_log (
  id bigint generated always as identity primary key,
  household_id uuid not null,
  actor uuid,
  table_name text not null,
  row_id uuid,
  action text not null,
  at timestamptz not null default now()
);

create function app.audit() returns trigger
language plpgsql security definer set search_path = '' as $$
-- to_jsonb porque cada tabela tem colunas diferentes.
declare r jsonb := to_jsonb(coalesce(new, old));
begin
  insert into public.audit_log (household_id, actor, table_name, row_id, action)
  values (
    coalesce((r ->> 'household_id')::uuid,
             (select household_id from public.debts where id = (r ->> 'debt_id')::uuid)),
    auth.uid(), tg_table_name,
    coalesce(r ->> 'id', r ->> 'user_id')::uuid,
    lower(tg_op));
  return coalesce(new, old);
end $$;

create trigger audit after insert or update or delete on public.debts for each row execute function app.audit();
create trigger audit after insert or update or delete on public.installments for each row execute function app.audit();
create trigger audit after insert or update or delete on public.loans for each row execute function app.audit();
create trigger audit after insert or update or delete on public.investments for each row execute function app.audit();
create trigger audit after insert or update or delete on public.documents for each row execute function app.audit();
create trigger audit after insert or update or delete on public.household_members for each row execute function app.audit();

-- Quem cria o lar vira dono.
create function app.add_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.household_members (household_id, user_id, role) values (new.id, new.created_by, 'owner');
  return new;
end $$;
create trigger add_owner after insert on public.households for each row execute function app.add_owner();

-- Não deixar o lar sem dono.
create function app.keep_an_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.role = 'owner' and (tg_op = 'DELETE' or new.role <> 'owner')
     and exists (select 1 from public.households where id = old.household_id)
     and not exists (select 1 from public.household_members
                     where household_id = old.household_id and role = 'owner' and user_id <> old.user_id) then
    raise exception 'o lar precisa de pelo menos um dono';
  end if;
  return coalesce(new, old);
end $$;
create trigger keep_an_owner before update or delete on public.household_members for each row execute function app.keep_an_owner();

-- Cria o lar e devolve o id (insert ... returning direto falha: a leitura é checada antes do trigger do dono).
create function public.create_household(household_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare hh uuid;
begin
  if auth.uid() is null then raise exception 'login necessário'; end if;
  insert into public.households (name, created_by) values (household_name, auth.uid()) returning id into hh;
  return hh;
end $$;

-- ---------------------------------------------------------------- convites
create function public.create_invite(hh uuid, invite_email text, invite_role text) returns text
language plpgsql security definer set search_path = '' as $$
declare token text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
begin
  if app.role_in(hh) is distinct from 'owner' then raise exception 'só o dono pode convidar'; end if;
  insert into public.invites (household_id, email, role, token_hash)
  values (hh, lower(invite_email), invite_role, encode(sha256(convert_to(token, 'utf8')), 'hex'));
  return token;
end $$;

create function public.accept_invite(token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare inv public.invites;
begin
  select * into inv from public.invites
  where token_hash = encode(sha256(convert_to(token, 'utf8')), 'hex')
    and accepted_at is null and expires_at > now()
  for update;
  if inv.id is null then raise exception 'convite inválido ou expirado'; end if;
  if inv.email <> lower(auth.jwt() ->> 'email') then raise exception 'convite é para outro e-mail'; end if;
  insert into public.household_members (household_id, user_id, role)
  values (inv.household_id, auth.uid(), inv.role)
  on conflict (household_id, user_id) do nothing;
  update public.invites set accepted_at = now() where id = inv.id;
  return inv.household_id;
end $$;

-- ---------------------------------------------------------------- RLS
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.invites enable row level security;
alter table public.debts enable row level security;
alter table public.installments enable row level security;
alter table public.loans enable row level security;
alter table public.investments enable row level security;
alter table public.documents enable row level security;
alter table public.audit_log enable row level security;

create policy read on public.households for select using (app.role_in(id) is not null);
create policy add on public.households for insert with check (created_by = auth.uid());
create policy edit on public.households for update using (app.role_in(id) = 'owner');
create policy remove on public.households for delete using (app.role_in(id) = 'owner');

create policy read on public.household_members for select using (app.role_in(household_id) is not null);
create policy edit on public.household_members for update using (app.role_in(household_id) = 'owner');
create policy remove on public.household_members for delete
  using (app.role_in(household_id) = 'owner' or user_id = auth.uid());

create policy read on public.invites for select using (app.role_in(household_id) = 'owner');
create policy remove on public.invites for delete using (app.role_in(household_id) = 'owner');

create policy read on public.debts for select using (app.can_read(household_id, owner_id, private));
create policy add on public.debts for insert with check (owner_id = auth.uid() and app.can_write(household_id, owner_id, private));
create policy edit on public.debts for update using (app.can_write(household_id, owner_id, private))
  with check (app.can_write(household_id, owner_id, private));
create policy remove on public.debts for delete using (app.can_write(household_id, owner_id, private));

-- Parcelas herdam o acesso da dívida.
create function app.can_write_debt(d uuid) returns boolean
language sql stable set search_path = '' as $$
  select exists (select 1 from public.debts x where x.id = d and app.can_write(x.household_id, x.owner_id, x.private))
$$;
create policy read on public.installments for select using (exists (select 1 from public.debts d where d.id = debt_id));
create policy add on public.installments for insert with check (app.can_write_debt(debt_id));
create policy edit on public.installments for update using (app.can_write_debt(debt_id)) with check (app.can_write_debt(debt_id));
create policy remove on public.installments for delete using (app.can_write_debt(debt_id));

create policy read on public.loans for select using (app.can_read(household_id, owner_id, private));
create policy add on public.loans for insert with check (owner_id = auth.uid() and app.can_write(household_id, owner_id, private));
create policy edit on public.loans for update using (app.can_write(household_id, owner_id, private))
  with check (app.can_write(household_id, owner_id, private));
create policy remove on public.loans for delete using (app.can_write(household_id, owner_id, private));

create policy read on public.investments for select using (app.can_read(household_id, owner_id, private));
create policy add on public.investments for insert with check (owner_id = auth.uid() and app.can_write(household_id, owner_id, private));
create policy edit on public.investments for update using (app.can_write(household_id, owner_id, private))
  with check (app.can_write(household_id, owner_id, private));
create policy remove on public.investments for delete using (app.can_write(household_id, owner_id, private));

create policy read on public.documents for select using (app.can_read(household_id, owner_id, private));
create policy add on public.documents for insert with check (owner_id = auth.uid() and app.can_write(household_id, owner_id, private));
create policy remove on public.documents for delete using (app.can_write(household_id, owner_id, private));

-- Auditoria: membros leem; ninguém escreve direto (só o trigger).
create policy read on public.audit_log for select using (app.role_in(household_id) is not null);

-- ---------------------------------------------------------------- permissões
revoke all on all tables in schema public from anon;
revoke all on function public.create_household, public.create_invite, public.accept_invite from public, anon;
grant usage on schema app to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke insert, update, delete on public.audit_log from authenticated;
revoke insert, update on public.invites from authenticated;
grant execute on function public.create_household, public.create_invite, public.accept_invite to authenticated;
