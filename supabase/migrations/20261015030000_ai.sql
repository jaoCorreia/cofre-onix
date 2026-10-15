-- IA: limite de uso diário por pessoa e gráficos/fórmulas salvos no painel do lar.

create table public.ai_usage (
  user_id uuid not null,
  day date not null default current_date,
  messages int not null default 0,
  primary key (user_id, day)
);
alter table public.ai_usage enable row level security;
create policy read on public.ai_usage for select using (user_id = auth.uid());

-- Conta uma mensagem e diz se ainda está dentro do limite. Chamada pela Edge Function.
create function public.ai_consume(daily_limit int) returns boolean
language plpgsql security definer set search_path = '' as $$
declare used int;
begin
  if auth.uid() is null then raise exception 'login necessário'; end if;
  insert into public.ai_usage (user_id, day, messages) values (auth.uid(), current_date, 1)
  on conflict (user_id, day) do update set messages = public.ai_usage.messages + 1
  returning messages into used;
  return used <= daily_limit;
end $$;
revoke all on function public.ai_consume from public, anon;
grant execute on function public.ai_consume to authenticated;

create table public.ai_saved (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  owner_id uuid not null default auth.uid(),
  private boolean not null default false,
  kind text not null check (kind in ('chart', 'formula')),
  title text not null check (length(title) between 1 and 80),
  spec jsonb not null check (pg_column_size(spec) < 20000),
  created_at timestamptz not null default now()
);
alter table public.ai_saved enable row level security;
create policy read on public.ai_saved for select using (app.can_read(household_id, owner_id, private));
create policy add on public.ai_saved for insert with check (owner_id = auth.uid() and app.can_write(household_id, owner_id, private));
create policy remove on public.ai_saved for delete using (app.can_write(household_id, owner_id, private));
create trigger audit after insert or delete on public.ai_saved for each row execute function app.audit();

grant select on public.ai_usage to authenticated;
grant select, insert, delete on public.ai_saved to authenticated;
