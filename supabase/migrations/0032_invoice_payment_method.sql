-- Adds a structured payment method to invoice payments (Cash / M-Pesa /
-- Bank transfer / Card / Cheque), alongside the existing free-text
-- reference — per explicit user request, so a payment record says *how*
-- it was paid, not just an optional reference string. This stays inside
-- 0008's original scope note ("a manually-recorded status + reference, not
-- a real payment gateway or ledger") — it's still just recording what
-- already happened, not processing anything.

alter table public.edospmis_invoices add column payment_method text;

-- Different arity from the existing 2-arg edospmis_record_payment, so drop
-- first — create-or-replace with a new arg list creates a second overload
-- rather than replacing the original (same note as 0009's edospmis_award_po).
drop function if exists public.edospmis_record_payment(uuid, text);

create or replace function public.edospmis_record_payment(p_invoice_id uuid, p_reference text, p_payment_method text default null)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_invoice record;
begin
  select * into v_invoice from public.edospmis_invoices where id = p_invoice_id;
  if v_invoice is null then
    raise exception 'That invoice could not be found.';
  end if;
  if not public.edospmis_has_permission(v_invoice.tenant_id, 'finance.payment.approve') then
    raise exception 'You do not have permission to record payments.';
  end if;
  if v_invoice.status <> 'approved' then
    raise exception 'This invoice must be approved before payment can be recorded.';
  end if;

  update public.edospmis_invoices
  set status = 'paid', paid_at = now(), payment_reference = p_reference, payment_method = p_payment_method
  where id = p_invoice_id;

  insert into public.edospmis_audit_logs (tenant_id, actor_id, action, entity_type, entity_id, after)
  values (v_invoice.tenant_id, auth.uid(), 'invoice.paid', 'invoice', p_invoice_id,
          jsonb_build_object('case_id', v_invoice.case_id, 'reference', p_reference, 'payment_method', p_payment_method));
end;
$$;
