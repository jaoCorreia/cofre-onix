-- Guarda o e-mail de cada membro para a tela "Lar" mostrar quem é quem.
alter table public.household_members add column email text;

create or replace function app.add_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.household_members (household_id, user_id, role, email)
  values (new.id, new.created_by, 'owner', lower(auth.jwt() ->> 'email'));
  return new;
end $$;

create or replace function public.accept_invite(token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare inv public.invites;
begin
  select * into inv from public.invites
  where token_hash = encode(sha256(convert_to(token, 'utf8')), 'hex')
    and accepted_at is null and expires_at > now()
  for update;
  if inv.id is null then raise exception 'convite inválido ou expirado'; end if;
  if inv.email <> lower(auth.jwt() ->> 'email') then raise exception 'convite é para outro e-mail'; end if;
  insert into public.household_members (household_id, user_id, role, email)
  values (inv.household_id, auth.uid(), inv.role, inv.email)
  on conflict (household_id, user_id) do nothing;
  update public.invites set accepted_at = now() where id = inv.id;
  return inv.household_id;
end $$;
