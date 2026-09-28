-- ──────────────────────────────────────────────────────────────────────
-- Correcting an invoice, and taking one back.
--
-- An invoice could be entered and never touched again. A transposed figure
-- or a wrong line had exactly one remedy: approve and pay the wrong amount,
-- or abandon the case. The `void` status has existed since the beginning —
-- the over-billing and quantity checks both exclude voided invoices from
-- their totals — and nothing could ever reach it.
--
-- Two additions, and one refactor that makes them safe.
--
-- The refactor: the three-way match is lifted out of `edospmis_submit_invoice`
-- into `edospmis_match_invoice`, which runs against an invoice that already
-- exists. Submission inserts and then matches; correction updates and then
-- matches again. There is one copy of the rule, so a corrected invoice is
-- judged by exactly the same standard as a fresh one — a second
-- implementation would drift, and the drift would be silent.
--
-- Correcting re-runs the match from scratch: the old exceptions are cleared
-- and raised again against the new figures. An exception somebody resolved
-- on the old numbers is deliberately not carried over. The note explained a
-- discrepancy that no longer exists, and keeping it would leave a resolution
-- attached to figures nobody ever looked at.
--
-- What cannot be corrected: an invoice that has been approved or paid. At
-- that point it is not a draft any more, it is a commitment somebody signed
-- for. Void it and enter the right one — which leaves both the mistake and
-- the correction on the record, where an auditor can follow them.
--
-- And nothing is deleted. A voided invoice keeps its number, its figures and
-- its reason, which is what stops the same supplier invoice being entered
-- twice by somebody who did not know the first one existed.
-- ──────────────────────────────────────────────────────────────────────

alter table public.edospmis_invoices
  add column if not exists void_reason text,
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid references public.edospmis_users(id) on delete set null;

comment on column public.edospmis_invoices.void_reason is
  'Why this invoice was taken back. Kept rather than deleted so the number stays claimed and cannot be re-entered by mistake.';

-- ── The match, against an invoice that already exists ─────────────────

create or replace function public.edospmis_match_invoice(p_invoice_id uuid)
returns text
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_invoice record;
  v_case record;
  v_po record;
  v_status text := 'matched';
  v_item jsonb;
  v_invoiced_qty numeric := 0;
  v_received_qty numeric := 0;
  v_prior_net bigint := 0;
  v_prior_qty numeric := 0;
  v_pct numeric := 0;
  v_flat bigint := 0;
  v_po_unit_cost bigint;
  v_line_cost bigint;
  v_allowed bigint;
  v_grn_id uuid;
begin
  select * into v_invoice from public.edospmis_invoices where id = p_invoice_id;
  if v_invoice is null then
    raise exception 'That invoice could not be found.';
  end if;
  select * into v_case from public.edospmis_cases where id = v_invoice.case_id;
  select * into v_po from public.edospmis_purchase_orders where id = v_invoice.po_id;
  if v_po is null then
    raise exception 'That invoice is not against a purchase order.';
  end if;

  -- Every finding is re-raised from the current figures, so a correction
  -- cannot leave a stale exception behind it.
  delete from public.edospmis_match_exceptions where invoice_id = p_invoice_id;

  select coalesce(price_pct, 0), coalesce(price_cents, 0) into v_pct, v_flat
  from public.edospmis_match_tolerances where tenant_id = v_invoice.tenant_id;
  v_pct := coalesce(v_pct, 0);
  v_flat := coalesce(v_flat, 0);

  for v_item in select * from jsonb_array_elements(v_invoice.items)
  loop
    v_invoiced_qty := v_invoiced_qty + coalesce((v_item ->> 'qty')::numeric, 0);
  end loop;

  select coalesce(sum(subtotal_cents), 0) into v_prior_net
  from public.edospmis_invoices
  where po_id = v_po.id and id <> p_invoice_id and status <> 'void';

  select coalesce(sum((i.item ->> 'qty')::numeric), 0) into v_prior_qty
  from public.edospmis_invoices inv
  cross join lateral jsonb_array_elements(inv.items) as i(item)
  where inv.po_id = v_po.id and inv.id <> p_invoice_id and inv.status <> 'void';

  select coalesce(sum(gi.received_qty), 0) into v_received_qty
  from public.edospmis_grn_items gi
  join public.edospmis_grns g on g.id = gi.grn_id
  where g.case_id = v_invoice.case_id;

  for v_item in select * from jsonb_array_elements(v_invoice.items)
  loop
    select (item ->> 'estimated_unit_cost_cents')::bigint into v_po_unit_cost
    from jsonb_array_elements(v_po.items) as item
    where item ->> 'description' = v_item ->> 'description'
    limit 1;

    v_line_cost := coalesce((v_item ->> 'unit_cost_cents')::bigint, 0);

    if v_po_unit_cost is null then
      insert into public.edospmis_match_exceptions (tenant_id, invoice_id, po_id, exception_type, detail)
      values (v_invoice.tenant_id, p_invoice_id, v_po.id, 'unordered_item',
              format('%s is not on %s.', v_item ->> 'description', v_po.po_number));
      v_status := 'exception';
    else
      v_allowed := greatest(v_flat, round(v_po_unit_cost * v_pct / 100.0));
      if abs(v_line_cost - v_po_unit_cost) > v_allowed then
        insert into public.edospmis_match_exceptions (tenant_id, invoice_id, po_id, exception_type, detail)
        values (v_invoice.tenant_id, p_invoice_id, v_po.id, 'price_mismatch',
                format('%s billed at KSh %s each, ordered at KSh %s.',
                       v_item ->> 'description',
                       to_char(round(v_line_cost / 100.0), 'FM999,999,999,990'),
                       to_char(round(v_po_unit_cost / 100.0), 'FM999,999,999,990')));
        v_status := 'exception';
      end if;
    end if;
  end loop;

  v_allowed := greatest(v_flat, round(v_po.total_cents * v_pct / 100.0));
  if v_prior_net + v_invoice.subtotal_cents > v_po.total_cents + v_allowed then
    insert into public.edospmis_match_exceptions (tenant_id, invoice_id, po_id, exception_type, detail)
    values (v_invoice.tenant_id, p_invoice_id, v_po.id, 'over_billing',
            format('Invoiced against this order so far KSh %s, more than the order''s KSh %s.',
                   to_char(round((v_prior_net + v_invoice.subtotal_cents) / 100.0), 'FM999,999,999,990'),
                   to_char(round(v_po.total_cents / 100.0), 'FM999,999,999,990')));
    v_status := 'exception';
  end if;

  -- Quantity, cumulative against everything received.
  --
  -- The finding used to be written by an INSERT ... SELECT over the case's
  -- goods-received notes. Where a case had none at all, that select returned
  -- nothing, so no row was written — while the status was still set to
  -- 'exception'. The result was an invoice flagged as having a problem with
  -- nothing anywhere saying what it was; found by re-matching a legacy
  -- invoice whose receipt predates the rule that now requires one. The
  -- receipt is looked up first and the finding written either way, with a
  -- null grn_id when there is nothing to point at — which is itself the
  -- thing worth reporting.
  if v_prior_qty + v_invoiced_qty > v_received_qty then
    select g.id into v_grn_id
    from public.edospmis_grns g
    where g.case_id = v_invoice.case_id
    order by g.received_at desc
    limit 1;

    insert into public.edospmis_match_exceptions (tenant_id, invoice_id, po_id, grn_id, exception_type, detail)
    values (v_invoice.tenant_id, p_invoice_id, v_po.id, v_grn_id,
            case when v_grn_id is null then 'missing_grn' else 'quantity_mismatch' end,
            case when v_grn_id is null
                 then format('Nothing has been received against %s, but %s has been invoiced.',
                             v_po.po_number, v_prior_qty + v_invoiced_qty)
                 else format('Invoiced quantity %s against this order exceeds the %s received.',
                             v_prior_qty + v_invoiced_qty, v_received_qty)
            end);
    v_status := 'exception';
  end if;

  update public.edospmis_invoices set status = v_status where id = p_invoice_id;
  return v_status;
end;
$$;

revoke all on function public.edospmis_match_invoice(uuid) from public;
revoke all on function public.edospmis_match_invoice(uuid) from anon;
revoke all on function public.edospmis_match_invoice(uuid) from authenticated;

-- ── Submitting, now delegating the match ──────────────────────────────

create or replace function public.edospmis_submit_invoice(
  p_case_id uuid,
  p_invoice_number text,
  p_items jsonb,
  p_tax_cents bigint,
  p_payment_terms text,
  p_due_date date
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_case record;
  v_po record;
  v_subtotal bigint := 0;
  v_total bigint;
  v_invoice_id uuid;
  v_has_grn boolean;
  v_item jsonb;
  v_status text;
  v_terms_days int;
  v_due_date date;
begin
  select * into v_case from public.edospmis_cases where id = p_case_id;
  if v_case is null then
    raise exception 'That case could not be found.';
  end if;
  if not public.edospmis_has_permission(v_case.tenant_id, 'finance.invoice.create') then
    raise exception 'You do not have permission to submit invoices.';
  end if;
  if v_case.status not in ('awarded', 'receiving', 'finance', 'delivery') then
    raise exception 'This case has no awarded purchase order to invoice against.';
  end if;
  if coalesce(trim(p_invoice_number), '') = '' then
    raise exception 'Enter the supplier''s invoice number.';
  end if;
  if jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one line item.';
  end if;

  -- An invoice without an order has nothing to be matched against, which is
  -- the whole control. This is why the number alone is never enough.
  select * into v_po from public.edospmis_purchase_orders where case_id = p_case_id;
  if v_po is null then
    raise exception 'This case has no purchase order.';
  end if;

  select exists (select 1 from public.edospmis_grns where case_id = p_case_id) into v_has_grn;
  if not v_has_grn then
    raise exception 'Record the goods received against % before invoicing it — an invoice is matched against the receipt, not against the order alone.', v_po.po_number;
  end if;

  if exists (
    select 1 from public.edospmis_invoices
    where tenant_id = v_case.tenant_id
      and supplier_id = v_po.supplier_id
      and lower(invoice_number) = lower(trim(p_invoice_number))
  ) then
    raise exception 'Invoice % has already been entered for this supplier.', p_invoice_number;
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_subtotal := v_subtotal + round(coalesce((v_item ->> 'qty')::numeric, 0) * coalesce((v_item ->> 'unit_cost_cents')::numeric, 0));
  end loop;
  v_total := v_subtotal + coalesce(p_tax_cents, 0);

  v_due_date := p_due_date;
  if v_due_date is null and p_payment_terms is not null then
    v_terms_days := nullif((regexp_match(p_payment_terms, '(\d+)\s*$'))[1], '')::int;
    if v_terms_days between 0 and 365 then
      v_due_date := current_date + v_terms_days;
    end if;
  end if;

  insert into public.edospmis_invoices
    (tenant_id, case_id, po_id, supplier_id, invoice_number, items, subtotal_cents, tax_cents, total_cents,
     currency, payment_terms, due_date, submitted_by)
  values
    (v_case.tenant_id, p_case_id, v_po.id, v_po.supplier_id, trim(p_invoice_number), p_items, v_subtotal,
     coalesce(p_tax_cents, 0), v_total, v_po.currency, p_payment_terms, v_due_date, auth.uid())
  returning id into v_invoice_id;

  v_status := public.edospmis_match_invoice(v_invoice_id);

  if v_case.status in ('awarded', 'receiving') then
    update public.edospmis_cases set status = 'finance', current_stage_key = 'finance' where id = p_case_id;
  end if;

  insert into public.edospmis_audit_logs (tenant_id, actor_id, action, entity_type, entity_id, after)
  values (v_case.tenant_id, auth.uid(), 'invoice.submitted', 'invoice', v_invoice_id,
          jsonb_build_object('case_id', p_case_id, 'status', v_status, 'total_cents', v_total));

  return v_invoice_id;
end;
$$;

-- ── Correcting one ────────────────────────────────────────────────────

create or replace function public.edospmis_update_invoice(
  p_invoice_id uuid,
  p_invoice_number text,
  p_items jsonb,
  p_tax_cents bigint,
  p_payment_terms text,
  p_due_date date
)
returns text
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_invoice record;
  v_before jsonb;
  v_subtotal bigint := 0;
  v_total bigint;
  v_item jsonb;
  v_status text;
  v_terms_days int;
  v_due_date date;
begin
  select * into v_invoice from public.edospmis_invoices where id = p_invoice_id;
  if v_invoice is null then
    raise exception 'That invoice could not be found.';
  end if;
  if not public.edospmis_has_permission(v_invoice.tenant_id, 'finance.invoice.create') then
    raise exception 'You do not have permission to correct invoices.';
  end if;

  -- Approved or paid is no longer a draft. Void it and enter the right one,
  -- so both the mistake and the correction stay on the record.
  if v_invoice.status = 'paid' then
    raise exception 'This invoice has been paid and cannot be changed. Void it and enter a corrected one.';
  end if;
  if v_invoice.status = 'approved' then
    raise exception 'This invoice has been approved for payment and cannot be changed. Void it and enter a corrected one.';
  end if;
  if v_invoice.status = 'void' then
    raise exception 'This invoice has been voided.';
  end if;
  if coalesce(trim(p_invoice_number), '') = '' then
    raise exception 'Enter the supplier''s invoice number.';
  end if;
  if jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one line item.';
  end if;

  -- The number may be corrected too, but not onto one already claimed by
  -- another invoice from the same supplier — that is the duplicate-payment
  -- control, and a correction must not be a way around it.
  if exists (
    select 1 from public.edospmis_invoices
    where tenant_id = v_invoice.tenant_id
      and supplier_id = v_invoice.supplier_id
      and id <> p_invoice_id
      and lower(invoice_number) = lower(trim(p_invoice_number))
  ) then
    raise exception 'Invoice % has already been entered for this supplier.', p_invoice_number;
  end if;

  v_before := jsonb_build_object(
    'invoice_number', v_invoice.invoice_number,
    'items', v_invoice.items,
    'subtotal_cents', v_invoice.subtotal_cents,
    'tax_cents', v_invoice.tax_cents,
    'total_cents', v_invoice.total_cents,
    'due_date', v_invoice.due_date
  );

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_subtotal := v_subtotal + round(coalesce((v_item ->> 'qty')::numeric, 0) * coalesce((v_item ->> 'unit_cost_cents')::numeric, 0));
  end loop;
  v_total := v_subtotal + coalesce(p_tax_cents, 0);

  v_due_date := p_due_date;
  if v_due_date is null and p_payment_terms is not null then
    v_terms_days := nullif((regexp_match(p_payment_terms, '(\d+)\s*$'))[1], '')::int;
    if v_terms_days between 0 and 365 then
      v_due_date := current_date + v_terms_days;
    end if;
  end if;

  update public.edospmis_invoices
  set invoice_number = trim(p_invoice_number),
      items = p_items,
      subtotal_cents = v_subtotal,
      tax_cents = coalesce(p_tax_cents, 0),
      total_cents = v_total,
      payment_terms = p_payment_terms,
      due_date = v_due_date
  where id = p_invoice_id;

  v_status := public.edospmis_match_invoice(p_invoice_id);

  insert into public.edospmis_audit_logs (tenant_id, actor_id, action, entity_type, entity_id, before, after)
  values (v_invoice.tenant_id, auth.uid(), 'invoice.corrected', 'invoice', p_invoice_id, v_before,
          jsonb_build_object('invoice_number', trim(p_invoice_number), 'items', p_items,
                             'subtotal_cents', v_subtotal, 'total_cents', v_total, 'status', v_status));

  return v_status;
end;
$$;

revoke all on function public.edospmis_update_invoice(uuid, text, jsonb, bigint, text, date) from public;
revoke all on function public.edospmis_update_invoice(uuid, text, jsonb, bigint, text, date) from anon;
grant execute on function public.edospmis_update_invoice(uuid, text, jsonb, bigint, text, date) to authenticated;

-- ── Taking one back ───────────────────────────────────────────────────

create or replace function public.edospmis_void_invoice(p_invoice_id uuid, p_reason text)
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
  -- Voiding reverses a commitment, so it takes the approval permission
  -- rather than the one that allows entering an invoice in the first place.
  if not public.edospmis_has_permission(v_invoice.tenant_id, 'finance.invoice.approve') then
    raise exception 'You do not have permission to void invoices.';
  end if;
  if v_invoice.status = 'paid' then
    raise exception 'This invoice has been paid. Record a credit note against the supplier rather than voiding the payment out of the record.';
  end if;
  if v_invoice.status = 'void' then
    raise exception 'This invoice has already been voided.';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Say why this invoice is being voided.';
  end if;

  update public.edospmis_invoices
  set status = 'void', void_reason = trim(p_reason), voided_at = now(), voided_by = auth.uid()
  where id = p_invoice_id;

  -- A voided invoice raises no findings: the figures it disagreed with are
  -- no longer claimed. The row itself stays, which is what keeps its number
  -- from being entered again.
  delete from public.edospmis_match_exceptions where invoice_id = p_invoice_id;

  insert into public.edospmis_audit_logs (tenant_id, actor_id, action, entity_type, entity_id, reason, after)
  values (v_invoice.tenant_id, auth.uid(), 'invoice.voided', 'invoice', p_invoice_id, trim(p_reason),
          jsonb_build_object('case_id', v_invoice.case_id, 'invoice_number', v_invoice.invoice_number,
                             'total_cents', v_invoice.total_cents));
end;
$$;

revoke all on function public.edospmis_void_invoice(uuid, text) from public;
revoke all on function public.edospmis_void_invoice(uuid, text) from anon;
grant execute on function public.edospmis_void_invoice(uuid, text) to authenticated;
