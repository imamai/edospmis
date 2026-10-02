-- ──────────────────────────────────────────────────────────────────────
-- A case closes itself when the money is settled and nothing is in transit.
--
-- Confirming a delivery already closes a case (migration 0053). A great many
-- cases never have a delivery — goods collected from the stores, a service
-- performed, anything nobody scheduled a trip for — and those sat at the
-- finance stage, fully paid, waiting for somebody to press Close. Nobody
-- presses Close. The pipeline fills with cases that are finished in every
-- sense except the one the dashboard counts.
--
-- WHAT DECIDES "SETTLED". Not this function. `edospmis_settle_po` already
-- answers whether an order is finished, and answers it more carefully than a
-- rule written here would: it requires the order to be issued, at least one
-- invoice to exist, no non-void invoice to be unpaid, and the paid net to
-- cover the order total within the tenant's own price tolerance. A case part-
-- invoiced across two invoices with one paid is not settled, and stays open.
--
-- That function already ran on every payment; its answer was simply thrown
-- away. Now it is read.
--
-- A second, hand-written "are all the invoices paid" check was the obvious
-- alternative and would have been wrong twice over: a duplicate of logic that
-- already exists, and one that would have missed the tolerance — leaving a
-- case fifty shillings short of its order total open for ever with nothing on
-- screen to explain why.
--
-- WHAT STOPS IT CLOSING. A delivery that has not been confirmed. Delivery is
-- offered on every case now, not only those with a client, so somebody having
-- scheduled one means the goods are still moving and the case is not over.
-- A case nobody scheduled a delivery for closes here.
-- ──────────────────────────────────────────────────────────────────────

create or replace function public.edospmis_record_payment(
  p_invoice_id uuid,
  p_reference text,
  p_payment_method text default null
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_invoice record;
  v_case record;
  v_settled boolean := false;
  v_delivery_open boolean;
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

  -- Payment is the last step the order itself has. The return value says
  -- whether this was the payment that finished it.
  if v_invoice.po_id is not null then
    v_settled := public.edospmis_settle_po(v_invoice.po_id);
  end if;

  if not v_settled then
    return;
  end if;

  -- Something still in transit keeps the case open; confirming it will close
  -- the case itself (migration 0053).
  select exists (
    select 1 from public.edospmis_deliveries d
     where d.case_id = v_invoice.case_id
       and d.status not in ('confirmed', 'cancelled')
  ) into v_delivery_open;

  if v_delivery_open then
    return;
  end if;

  select * into v_case from public.edospmis_cases where id = v_invoice.case_id;

  -- A case somebody already closed, rejected or cancelled by hand keeps that
  -- outcome. It must not be quietly overwritten with "closed".
  if v_case.status in ('closed', 'rejected', 'returned', 'cancelled') then
    return;
  end if;

  update public.edospmis_cases
  set status = 'closed', current_stage_key = 'closed', closed_at = now()
  where id = v_invoice.case_id;

  -- Its own entry, with a reason. A close with no actor and no explanation is
  -- the kind of audit line that costs somebody an afternoon.
  insert into public.edospmis_audit_logs (tenant_id, actor_id, action, entity_type, entity_id, reason)
  values (v_invoice.tenant_id, auth.uid(), 'case.closed', 'case', v_invoice.case_id,
          'Closed automatically: the order was settled in full and no delivery was outstanding.');
end;
$$;

revoke all on function public.edospmis_record_payment(uuid, text, text) from public;
revoke all on function public.edospmis_record_payment(uuid, text, text) from anon;
grant execute on function public.edospmis_record_payment(uuid, text, text) to authenticated;
