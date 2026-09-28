-- ──────────────────────────────────────────────────────────────────────
-- Closing a purchase order.
--
-- A purchase order had three states — pending_approval, issued, cancelled —
-- and no way to reach an end. Every order ever raised read `issued` forever,
-- including the ones whose case had been closed and paid months earlier, so
-- "is this order finished?" could only be answered by opening the case and
-- reading its stage. An order is a document with its own life; it should be
-- able to end.
--
-- Settled means: at least one invoice, every non-void invoice paid, and the
-- cumulative paid value covering the order. The comparison is net of tax on
-- both sides, because the order is priced net — the same reason 0040 excludes
-- tax from its over-billing check.
--
-- It also respects the tenant's match tolerance. The number that already
-- decides "this invoice matches the order" is the right number to decide
-- "this order is now covered"; without it a one-shilling rounding difference
-- would hold an order open permanently, and a state nothing can reach is the
-- bug this migration exists to fix.
-- ──────────────────────────────────────────────────────────────────────

alter table public.edospmis_purchase_orders
  drop constraint if exists edospmis_purchase_orders_status_check;
alter table public.edospmis_purchase_orders
  add constraint edospmis_purchase_orders_status_check
  check (status in ('pending_approval', 'issued', 'closed', 'cancelled'));

alter table public.edospmis_purchase_orders
  add column if not exists closed_at timestamptz;

comment on column public.edospmis_purchase_orders.closed_at is
  'When this order was settled and closed — every invoice against it paid and the order value covered, or the case it belongs to closed.';

-- ── Settle an order, if it is in fact settled ─────────────────────────
-- Returns whether it closed, so a caller can tell the difference between
-- "closed it" and "not yet". Internal: it is reached through the functions
-- below, which do their own permission checks, so it is not granted to
-- authenticated.

create or replace function public.edospmis_settle_po(p_po_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_po record;
  v_tol record;
  v_invoices int;
  v_unpaid int;
  v_paid_net bigint;
  v_allowance bigint;
begin
  select * into v_po from public.edospmis_purchase_orders where id = p_po_id;
  -- Only a live order closes. A cancelled one already ended, and one still
  -- awaiting approval was never sent.
  if v_po is null or v_po.status <> 'issued' then
    return false;
  end if;

  select
    count(*) filter (where status <> 'void'),
    count(*) filter (where status not in ('void', 'paid')),
    coalesce(sum(subtotal_cents) filter (where status = 'paid'), 0)
  into v_invoices, v_unpaid, v_paid_net
  from public.edospmis_invoices
  where po_id = p_po_id;

  -- An order with nothing billed against it is not settled, it is untouched.
  if v_invoices = 0 or v_unpaid > 0 then
    return false;
  end if;

  select * into v_tol from public.edospmis_match_tolerances where tenant_id = v_po.tenant_id;
  v_allowance := greatest(
    round(v_po.total_cents * coalesce(v_tol.price_pct, 0) / 100.0),
    coalesce(v_tol.price_cents, 0)
  )::bigint;

  -- Part-invoiced: the supplier has been paid for what they billed, but the
  -- order still has value to run against, so it stays open.
  if v_paid_net + v_allowance < v_po.total_cents then
    return false;
  end if;

  update public.edospmis_purchase_orders
  set status = 'closed', closed_at = now()
  where id = p_po_id;

  insert into public.edospmis_audit_logs (tenant_id, actor_id, action, entity_type, entity_id, after)
  values (v_po.tenant_id, auth.uid(), 'po.closed', 'purchase_order', p_po_id,
          jsonb_build_object('case_id', v_po.case_id, 'paid_net_cents', v_paid_net,
                             'order_cents', v_po.total_cents, 'via', 'payment'));

  return true;
end;
$$;

revoke all on function public.edospmis_settle_po(uuid) from public;
revoke all on function public.edospmis_settle_po(uuid) from anon;
revoke all on function public.edospmis_settle_po(uuid) from authenticated;

-- ── Recording the last payment closes the order ───────────────────────
-- Recreated whole: `create or replace` needs the full body, and a partial
-- rewrite here is how the award function lost an argument in 0009.

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

  -- Payment is the last step the order itself has. Where this was the
  -- payment that covered it, the order ends here rather than staying live
  -- until somebody remembers to close the case.
  if v_invoice.po_id is not null then
    perform public.edospmis_settle_po(v_invoice.po_id);
  end if;
end;
$$;

revoke all on function public.edospmis_record_payment(uuid, text, text) from public;
revoke all on function public.edospmis_record_payment(uuid, text, text) from anon;
grant execute on function public.edospmis_record_payment(uuid, text, text) to authenticated;

-- ── Closing the case closes anything still open on it ─────────────────

create or replace function public.edospmis_close_case(p_case_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_case record;
begin
  select * into v_case from public.edospmis_cases where id = p_case_id;
  if v_case is null then
    raise exception 'That case could not be found.';
  end if;
  if not public.edospmis_has_permission(v_case.tenant_id, 'procurement.case.close') then
    raise exception 'You do not have permission to close cases.';
  end if;
  if v_case.status in ('closed', 'rejected', 'returned', 'cancelled') then
    raise exception 'This case is already closed.';
  end if;

  update public.edospmis_cases
  set status = 'closed', current_stage_key = 'closed', closed_at = now()
  where id = p_case_id;

  -- A finished case must not leave a live order behind it. This is the
  -- deliberate override of the settlement rule above: whoever closes the case
  -- is stating the work is done, part-billed or not, and the order should
  -- read that way too.
  with shut as (
    update public.edospmis_purchase_orders
    set status = 'closed', closed_at = now()
    where case_id = p_case_id and status = 'issued'
    returning id, tenant_id, case_id
  )
  insert into public.edospmis_audit_logs (tenant_id, actor_id, action, entity_type, entity_id, after)
  select tenant_id, auth.uid(), 'po.closed', 'purchase_order', id,
         jsonb_build_object('case_id', case_id, 'via', 'case_closed')
  from shut;

  insert into public.edospmis_audit_logs (tenant_id, actor_id, action, entity_type, entity_id, reason)
  values (v_case.tenant_id, auth.uid(), 'case.closed', 'case', p_case_id, p_reason);
end;
$$;

-- ── Backfill ──────────────────────────────────────────────────────────
-- Settled orders close at their last payment, which is when they actually
-- ended. Anything still live on an already-closed case closes with the case.
-- No tolerance is applied here: a backfill should be the conservative read,
-- and the second pass picks up whatever the first leaves behind.

with settled as (
  select po_id,
         max(paid_at) as last_paid,
         coalesce(sum(subtotal_cents) filter (where status = 'paid'), 0) as paid_net
  from public.edospmis_invoices
  where po_id is not null
  group by po_id
  having count(*) filter (where status <> 'void') > 0
     and count(*) filter (where status not in ('void', 'paid')) = 0
)
update public.edospmis_purchase_orders po
set status = 'closed', closed_at = coalesce(s.last_paid, po.issued_at)
from settled s
where s.po_id = po.id
  and po.status = 'issued'
  and s.paid_net >= po.total_cents;

update public.edospmis_purchase_orders po
set status = 'closed', closed_at = coalesce(c.closed_at, now())
from public.edospmis_cases c
where c.id = po.case_id
  and po.status = 'issued'
  and c.status = 'closed';
