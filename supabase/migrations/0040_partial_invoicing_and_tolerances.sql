-- Partial invoicing, and a tolerance on the match.
--
-- A purchase order could carry exactly one invoice. A supplier delivering in
-- two drops and billing for each — the ordinary case — had nowhere to put the
-- second invoice, and the rule enforcing that ("This purchase order already
-- has an invoice") was a unique index on po_id.
--
-- Allowing several invoices per order changes what the three-way match means,
-- so the match is rebuilt rather than relaxed:
--
--   * Price is now checked line by line against the order's own unit price,
--     not by comparing one invoice's total to the order's total. Comparing
--     totals only ever worked when the invoice was the whole order; on a part
--     invoice it fired every time, which is how a control becomes noise.
--   * A line billed that is not on the order at all is its own finding rather
--     than being folded into a price variance.
--   * Over-billing is cumulative: everything invoiced against the order so
--     far, this invoice included, against the order's value. Tax is excluded
--     from that comparison — the order is priced net, so a tax-inclusive
--     invoice would otherwise look like an overcharge.
--   * Quantity is cumulative too: everything invoiced against the order
--     against everything received.
--
-- The tolerance exists because a control that fires on a one-shilling
-- rounding gets waved through, and a control that is waved through is not a
-- control. It is off by default — zero and zero — so nothing changes for a
-- tenant that does not set one. Both a percentage and a flat amount may be
-- set and the more generous applies, which is what lets a small flat
-- tolerance cover rounding on cheap lines while a percentage covers freight
-- and exchange movement on expensive ones.

-- One invoice per order is no longer the rule. It is a unique constraint
-- rather than a bare index, so the constraint is what has to go.
alter table public.edospmis_invoices drop constraint if exists edospmis_invoices_po_id_key;

-- Two new kinds of finding.
alter table public.edospmis_match_exceptions drop constraint if exists edospmis_match_exceptions_exception_type_check;
alter table public.edospmis_match_exceptions add constraint edospmis_match_exceptions_exception_type_check
  check (exception_type in ('quantity_mismatch', 'price_mismatch', 'missing_grn', 'over_billing', 'unordered_item'));

create table if not exists public.edospmis_match_tolerances (
  tenant_id uuid primary key references public.edospmis_tenants(id) on delete cascade,
  price_pct numeric(5,2) not null default 0 check (price_pct >= 0 and price_pct <= 100),
  price_cents bigint not null default 0 check (price_cents >= 0),
  updated_at timestamptz not null default now()
);

alter table public.edospmis_match_tolerances enable row level security;

drop policy if exists edospmis_match_tolerances_select on public.edospmis_match_tolerances;
create policy edospmis_match_tolerances_select on public.edospmis_match_tolerances
  for select using (public.edospmis_is_member(tenant_id));
drop policy if exists edospmis_match_tolerances_update on public.edospmis_match_tolerances;
create policy edospmis_match_tolerances_update on public.edospmis_match_tolerances
  for update using (public.edospmis_has_permission(tenant_id, 'admin.approvals.manage'));
drop policy if exists edospmis_match_tolerances_delete on public.edospmis_match_tolerances;
create policy edospmis_match_tolerances_delete on public.edospmis_match_tolerances
  for delete using (public.edospmis_has_permission(tenant_id, 'admin.approvals.manage'));

grant select on public.edospmis_match_tolerances to authenticated;

create or replace function public.edospmis_set_match_tolerances(
  p_tenant_id uuid,
  p_price_pct numeric,
  p_price_cents bigint
)
returns void
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
begin
  if not public.edospmis_has_permission(p_tenant_id, 'admin.approvals.manage') then
    raise exception 'You do not have permission to change these settings.';
  end if;
  if p_price_pct < 0 or p_price_pct > 100 then
    raise exception 'A percentage tolerance has to be between 0 and 100.';
  end if;
  if p_price_cents < 0 then
    raise exception 'A flat tolerance cannot be negative.';
  end if;

  insert into public.edospmis_match_tolerances (tenant_id, price_pct, price_cents, updated_at)
  values (p_tenant_id, p_price_pct, p_price_cents, now())
  on conflict (tenant_id) do update
    set price_pct = excluded.price_pct,
        price_cents = excluded.price_cents,
        updated_at = now();

  insert into public.edospmis_audit_logs (tenant_id, actor_id, action, entity_type, entity_id, after)
  values (p_tenant_id, auth.uid(), 'match_tolerances.updated', 'tenant', p_tenant_id,
          jsonb_build_object('price_pct', p_price_pct, 'price_cents', p_price_cents));
end;
$function$;

revoke all on function public.edospmis_set_match_tolerances(uuid, numeric, bigint) from public;
grant execute on function public.edospmis_set_match_tolerances(uuid, numeric, bigint) to authenticated;

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
set search_path to 'public', 'auth'
as $function$
declare
  v_case record;
  v_po record;
  v_subtotal bigint := 0;
  v_total bigint;
  v_invoice_id uuid;
  v_invoiced_qty numeric := 0;
  v_received_qty numeric := 0;
  v_prior_net bigint := 0;
  v_prior_qty numeric := 0;
  v_has_grn boolean;
  v_item jsonb;
  v_status text := 'matched';
  v_terms_days int;
  v_due_date date;
  v_pct numeric := 0;
  v_flat bigint := 0;
  v_po_unit_cost bigint;
  v_line_cost bigint;
  v_allowed bigint;
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
  if jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one line item.';
  end if;

  select * into v_po from public.edospmis_purchase_orders where case_id = p_case_id;
  if v_po is null then
    raise exception 'This case has no purchase order.';
  end if;

  -- The receipt comes first. Checked before anything is written, so a refused
  -- invoice leaves nothing behind.
  select exists (select 1 from public.edospmis_grns where case_id = p_case_id) into v_has_grn;
  if not v_has_grn then
    raise exception 'Record the goods received against % before invoicing it — an invoice is matched against the receipt, not against the order alone.', v_po.po_number;
  end if;

  -- Duplicate payment prevention: the same supplier invoice number, already
  -- entered for this supplier. The unique index enforces this too; the raise
  -- is what makes the refusal readable.
  if exists (
    select 1 from public.edospmis_invoices
    where tenant_id = v_case.tenant_id
      and supplier_id = v_po.supplier_id
      and lower(invoice_number) = lower(p_invoice_number)
  ) then
    raise exception 'Invoice % has already been entered for this supplier.', p_invoice_number;
  end if;

  select coalesce(price_pct, 0), coalesce(price_cents, 0) into v_pct, v_flat
  from public.edospmis_match_tolerances where tenant_id = v_case.tenant_id;
  v_pct := coalesce(v_pct, 0);
  v_flat := coalesce(v_flat, 0);

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_subtotal := v_subtotal + round(coalesce((v_item ->> 'qty')::numeric, 0) * coalesce((v_item ->> 'unit_cost_cents')::numeric, 0));
    v_invoiced_qty := v_invoiced_qty + coalesce((v_item ->> 'qty')::numeric, 0);
  end loop;
  v_total := v_subtotal + coalesce(p_tax_cents, 0);

  -- A due date, derived from the terms when one was not given.
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
    (v_case.tenant_id, p_case_id, v_po.id, v_po.supplier_id, p_invoice_number, p_items, v_subtotal, coalesce(p_tax_cents, 0), v_total,
     v_po.currency, p_payment_terms, v_due_date, auth.uid())
  returning id into v_invoice_id;

  -- What this order has already been billed, excluding this invoice and
  -- anything voided.
  select coalesce(sum(subtotal_cents), 0) into v_prior_net
  from public.edospmis_invoices
  where po_id = v_po.id and id <> v_invoice_id and status <> 'void';

  select coalesce(sum((i.item ->> 'qty')::numeric), 0) into v_prior_qty
  from public.edospmis_invoices inv
  cross join lateral jsonb_array_elements(inv.items) as i(item)
  where inv.po_id = v_po.id and inv.id <> v_invoice_id and inv.status <> 'void';

  select coalesce(sum(gi.received_qty), 0) into v_received_qty
  from public.edospmis_grn_items gi
  join public.edospmis_grns g on g.id = gi.grn_id
  where g.case_id = p_case_id;

  -- Price, line by line, against the order's own unit price.
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select (item ->> 'estimated_unit_cost_cents')::bigint into v_po_unit_cost
    from jsonb_array_elements(v_po.items) as item
    where item ->> 'description' = v_item ->> 'description'
    limit 1;

    v_line_cost := coalesce((v_item ->> 'unit_cost_cents')::bigint, 0);

    if v_po_unit_cost is null then
      insert into public.edospmis_match_exceptions (tenant_id, invoice_id, po_id, exception_type, detail)
      values (v_case.tenant_id, v_invoice_id, v_po.id, 'unordered_item',
              format('%s is not on %s.', v_item ->> 'description', v_po.po_number));
      v_status := 'exception';
    else
      v_allowed := greatest(v_flat, round(v_po_unit_cost * v_pct / 100.0));
      if abs(v_line_cost - v_po_unit_cost) > v_allowed then
        insert into public.edospmis_match_exceptions (tenant_id, invoice_id, po_id, exception_type, detail)
        values (v_case.tenant_id, v_invoice_id, v_po.id, 'price_mismatch',
                format('%s billed at KSh %s each, ordered at KSh %s.',
                       v_item ->> 'description',
                       to_char(round(v_line_cost / 100.0), 'FM999,999,999,990'),
                       to_char(round(v_po_unit_cost / 100.0), 'FM999,999,999,990')));
        v_status := 'exception';
      end if;
    end if;
  end loop;

  -- Over-billing, cumulative and net of tax.
  v_allowed := greatest(v_flat, round(v_po.total_cents * v_pct / 100.0));
  if v_prior_net + v_subtotal > v_po.total_cents + v_allowed then
    insert into public.edospmis_match_exceptions (tenant_id, invoice_id, po_id, exception_type, detail)
    values (v_case.tenant_id, v_invoice_id, v_po.id, 'over_billing',
            format('Invoiced against this order so far KSh %s, more than the order''s KSh %s.',
                   to_char(round((v_prior_net + v_subtotal) / 100.0), 'FM999,999,999,990'),
                   to_char(round(v_po.total_cents / 100.0), 'FM999,999,999,990')));
    v_status := 'exception';
  end if;

  -- Quantity, cumulative against everything received.
  if v_prior_qty + v_invoiced_qty > v_received_qty then
    insert into public.edospmis_match_exceptions (tenant_id, invoice_id, po_id, grn_id, exception_type, detail)
    select v_case.tenant_id, v_invoice_id, v_po.id, g.id, 'quantity_mismatch',
           format('Invoiced quantity %s against this order exceeds the %s received.',
                  v_prior_qty + v_invoiced_qty, v_received_qty)
    from public.edospmis_grns g where g.case_id = p_case_id
    order by g.received_at desc limit 1;
    v_status := 'exception';
  end if;

  update public.edospmis_invoices set status = v_status where id = v_invoice_id;

  if v_case.status in ('awarded', 'receiving') then
    update public.edospmis_cases set status = 'finance', current_stage_key = 'finance' where id = p_case_id;
  end if;

  insert into public.edospmis_audit_logs (tenant_id, actor_id, action, entity_type, entity_id, after)
  values (v_case.tenant_id, auth.uid(), 'invoice.submitted', 'invoice', v_invoice_id,
          jsonb_build_object('case_id', p_case_id, 'status', v_status, 'total_cents', v_total));

  return v_invoice_id;
end;
$function$;
