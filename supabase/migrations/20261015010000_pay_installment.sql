-- Pagar (ou desfazer o pagamento de) uma parcela e atualizar o saldo da dívida numa só transação.
-- security invoker: as políticas de RLS de quem chama continuam valendo.
create function public.set_installment_paid(installment_id uuid, paid boolean) returns void
language plpgsql security invoker set search_path = '' as $$
declare i public.installments;
begin
  select * into i from public.installments where id = installment_id for update;
  if i.id is null then raise exception 'parcela não encontrada'; end if;
  if (i.paid_at is not null) = paid then return; end if;

  update public.installments set paid_at = case when paid then now() end where id = installment_id;
  update public.debts
     set balance_cents = balance_cents + case when paid then -i.amortization_cents else i.amortization_cents end,
         updated_at = now()
   where id = i.debt_id;
  if not found then raise exception 'sem permissão para alterar esta dívida'; end if;
end $$;

revoke all on function public.set_installment_paid from public, anon;
grant execute on function public.set_installment_paid to authenticated;
