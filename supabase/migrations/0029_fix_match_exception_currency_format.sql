-- Phase 11a — edospmis_submit_invoice wrote raw cents integers straight into
-- the price_mismatch exception's free-text detail ("Invoice total 28000000
-- does not match PO total 30000000."), instead of formatting them as
-- shillings like every other amount in the UI (src/lib/utils.ts formatMoney).
-- Fixes the generator going forward and backfills the one existing bad row.

create or replace function public.edospmis_submit_invoice(
  p_case_id uuid, p_invoice_number text, p_items jsonb, p_tax_cents bigint,
  p_payment_terms text, p_due_date date
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
  v_invoiced_qty numeric := 0;
  v_received_qty numeric := 0;
  v_has_grn boolean;
  v_item jsonb;
  v_status text := 'matched';
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
  if exists (select 1 from public.edospmis_invoices where po_id = v_po.id) then
    raise exception 'This purchase order already has an invoice.';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_subtotal := v_subtotal + round(coalesce((v_item ->> 'qty')::numeric, 0) * coalesce((v_item ->> 'unit_cost_cents')::numeric, 0));
    v_invoiced_qty := v_invoiced_qty + coalesce((v_item ->> 'qty')::numeric, 0);
  end loop;
  v_total := v_subtotal + coalesce(p_tax_cents, 0);

  insert into public.edospmis_invoices
    (tenant_id, case_id, po_id, supplier_id, invoice_number, items, subtotal_cents, tax_cents, total_cents,
     currency, payment_terms, due_date, submitted_by)
  values
    (v_case.tenant_id, p_case_id, v_po.id, v_po.supplier_id, p_invoice_number, p_items, v_subtotal, coalesce(p_tax_cents, 0), v_total,
     v_po.currency, p_payment_terms, p_due_date, auth.uid())
  returning id into v_invoice_id;

  -- Three-way match: PO total vs invoice total, and total received vs total invoiced.
  select exists (select 1 from public.edospmis_grns where case_id = p_case_id) into v_has_grn;
  select coalesce(sum(gi.received_qty), 0) into v_received_qty
  from public.edospmis_grn_items gi
  join public.edospmis_grns g on g.id = gi.grn_id
  where g.case_id = p_case_id;

  if not v_has_grn then
    insert into public.edospmis_match_exceptions (tenant_id, invoice_id, po_id, exception_type, detail)
    values (v_case.tenant_id, v_invoice_id, v_po.id, 'missing_grn', 'No goods-received note exists for this case yet.');
    v_status := 'exception';
  end if;

  if v_total <> v_po.total_cents then
    insert into public.edospmis_match_exceptions (tenant_id, invoice_id, po_id, exception_type, detail)
    values (v_case.tenant_id, v_invoice_id, v_po.id, 'price_mismatch',
            format('Invoice total KSh %s does not match PO total KSh %s.',
                   to_char(round(v_total / 100.0), 'FM999,999,999,990'),
                   to_char(round(v_po.total_cents / 100.0), 'FM999,999,999,990')));
    v_status := 'exception';
  end if;

  if v_has_grn and v_invoiced_qty > v_received_qty then
    insert into public.edospmis_match_exceptions (tenant_id, invoice_id, po_id, grn_id, exception_type, detail)
    select v_case.tenant_id, v_invoice_id, v_po.id, g.id, 'quantity_mismatch',
           format('Invoiced quantity %s exceeds total received quantity %s.', v_invoiced_qty, v_received_qty)
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
$$;

-- Backfill the one existing exception created with the old, unformatted text.
update public.edospmis_match_exceptions
set detail = 'Invoice total KSh 280,000 does not match PO total KSh 300,000.'
where id = 'c06bdc5c-8066-4551-9376-8c05b02a10da'
  and detail = 'Invoice total 28000000 does not match PO total 30000000.';
