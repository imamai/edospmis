-- ──────────────────────────────────────────────────────────────────────
-- A case closes when the goods are confirmed AND the money is settled.
--
-- There were two auto-closes and they were wrong in opposite directions.
--
--   0053 closed on delivery confirmation without looking at the money. A case
--   could close with an invoice still unpaid — a liability filed as finished,
--   which is the worse of the two because nothing on the dashboard ever shows
--   it again.
--
--   0056 closed on settlement when no delivery was outstanding, reading "no
--   delivery row" as "no delivery needed". It equally means "nobody has
--   scheduled one yet", and PR-2026-000010 proved it: paid and closed in the
--   same minute with zero deliveries and goods still to go somewhere.
--
-- Neither event is the end of the case. Whichever of them happens LAST is.
-- So both call the same function, which closes only when both are true, and
-- does nothing when they are not.
--
-- WHAT COUNTS AS SETTLED is still edospmis_settle_po's answer, not a rule
-- restated here: it already weighs part-invoicing, void invoices and the
-- tenant's own price tolerance, and it records the result as the order's own
-- status. A case whose order is not 'closed' is not settled.
--
-- WHAT COUNTS AS CONFIRMED is a delivery row with status 'confirmed'. A
-- cancelled delivery does not count — it is not a confirmation that anything
-- arrived — and neither does the absence of a delivery.
--
-- THE COST, STATED PLAINLY. A case that genuinely needs no delivery no longer
-- closes itself; somebody presses Close. That is the trade asked for, and it
-- is the safer side to err on: a case left open is visible and someone will
-- deal with it, while a case closed before the goods moved is invisible and
-- nobody will.
-- ──────────────────────────────────────────────────────────────────────

create or replace function public.edospmis_try_close_case(p_case_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_case record;
  v_settled boolean;
  v_confirmed boolean;
begin
  select * into v_case from public.edospmis_cases where id = p_case_id;
  if v_case is null then return false; end if;

  -- An outcome somebody chose stands. It must never be overwritten with
  -- "closed" by a background rule.
  if v_case.status in ('closed', 'rejected', 'returned', 'cancelled') then
    return false;
  end if;

  -- Settled is the order's own recorded state, set by edospmis_settle_po.
  -- A case with no order has nothing to settle and does not close here.
  select exists (
    select 1 from public.edospmis_purchase_orders po
     where po.case_id = p_case_id and po.status = 'closed'
  ) into v_settled;
  if not v_settled then return false; end if;

  select exists (
    select 1 from public.edospmis_deliveries d
     where d.case_id = p_case_id and d.status = 'confirmed'
  ) into v_confirmed;
  if not v_confirmed then return false; end if;

  update public.edospmis_cases
  set status = 'closed', current_stage_key = 'closed', closed_at = now()
  where id = p_case_id;

  insert into public.edospmis_audit_logs (tenant_id, actor_id, action, entity_type, entity_id, reason)
  values (v_case.tenant_id, auth.uid(), 'case.closed', 'case', p_case_id,
          'Closed automatically: the delivery was confirmed and the order was settled in full.');

  return true;
end;
$$;

revoke all on function public.edospmis_try_close_case(uuid) from public;
revoke all on function public.edospmis_try_close_case(uuid) from anon;
grant execute on function public.edospmis_try_close_case(uuid) to authenticated;

-- ── Confirming a delivery: now asks, rather than assumes ──────────────
--
-- The permission nuance from 0053 stands: this is not gated on
-- procurement.case.close. A delivery officer confirming an arrival is
-- reporting a fact, not exercising the discretion that permission guards.

create or replace function public.edospmis_confirm_delivery(
  p_delivery_id uuid,
  p_proof_type text,
  p_proof_ref text,
  p_notes text
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_delivery record;
begin
  select * into v_delivery from public.edospmis_deliveries where id = p_delivery_id;
  if v_delivery is null then
    raise exception 'That delivery could not be found.';
  end if;
  if not public.edospmis_has_permission(v_delivery.tenant_id, 'delivery.complete') then
    raise exception 'You do not have permission to complete a delivery.';
  end if;
  if v_delivery.status <> 'dispatched' then
    raise exception 'This delivery must be dispatched before it can be confirmed.';
  end if;

  update public.edospmis_deliveries
  set status = 'confirmed', delivered_at = now(), client_confirmed_at = now(),
      proof_type = p_proof_type, proof_ref = p_proof_ref,
      notes = coalesce(nullif(p_notes, ''), notes)
  where id = p_delivery_id;

  insert into public.edospmis_audit_logs (tenant_id, actor_id, action, entity_type, entity_id, after)
  values (v_delivery.tenant_id, auth.uid(), 'delivery.confirmed', 'delivery', p_delivery_id,
          jsonb_build_object('case_id', v_delivery.case_id, 'proof_type', p_proof_type));

  perform public.edospmis_try_close_case(v_delivery.case_id);
end;
$$;

revoke all on function public.edospmis_confirm_delivery(uuid, text, text, text) from public;
revoke all on function public.edospmis_confirm_delivery(uuid, text, text, text) from anon;
grant execute on function public.edospmis_confirm_delivery(uuid, text, text, text) to authenticated;

-- ── Recording a payment: settles the order, then asks ─────────────────

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

  -- Settling the order is still this payment's job; deciding the case is over
  -- is not, and was the mistake in 0056.
  if v_invoice.po_id is not null then
    perform public.edospmis_settle_po(v_invoice.po_id);
  end if;

  perform public.edospmis_try_close_case(v_invoice.case_id);
end;
$$;

revoke all on function public.edospmis_record_payment(uuid, text, text) from public;
revoke all on function public.edospmis_record_payment(uuid, text, text) from anon;
grant execute on function public.edospmis_record_payment(uuid, text, text) to authenticated;
