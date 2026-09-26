-- Switch the default case/PR numbering format from "CASE-" to "PR-", per
-- explicit user instruction to align the stored identifier with the "PR
-- No." label now used everywhere in the UI (this session's audit found the
-- label already said "PR No." while the underlying value still read
-- "CASE-2026-000009" underneath it — a visible mismatch). Deliberately
-- narrow: only the numbering *string* changes. edospmis_cases stays the
-- durable entity, case_id stays the FK on every downstream table — nothing
-- about the Case/PR architectural split (ARCHITECTURE.md §1.2) changes.

-- New tenants provisioned from now on get the new default.
alter table public.edospmis_tenants
  alter column numbering_format set default 'PR-{year}-{seq}';

-- Existing tenants still on the untouched original default move too —
-- anyone who already customized their own format (Settings > Organization)
-- keeps whatever they set.
update public.edospmis_tenants
set numbering_format = 'PR-{year}-{seq}'
where numbering_format = 'CASE-{year}-{seq}';

-- Backfill already-issued numbers so historical records read the same way
-- as everything issued from now on.
update public.edospmis_cases
set case_number = replace(case_number, 'CASE-', 'PR-')
where case_number like 'CASE-%';

-- PO and GRN numbers are derived from the case's own number with its
-- prefix swapped (e.g. PR-2026-000005 -> PO-2026-000005) rather than a
-- parallel sequence — see the original design note in 0005's header. Both
-- derivations matched on a hard-coded '^CASE' prefix, which the backfill
-- above just made stale; recreated here against '^PR' instead. Already-
-- issued po_number/grn_number rows are untouched deliberately — they were
-- already correctly derived from the case_number at the time and don't
-- need to change just because the case's own number display changed.

create or replace function public.edospmis_award_po(p_rfq_id uuid, p_quotation_id uuid, p_notes text, p_expected_delivery_date date)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_rfq record;
  v_quotation record;
  v_tenant record;
  v_case_number text;
  v_po_number text;
  v_po_id uuid;
  v_po_status text;
  v_case_status text;
begin
  select * into v_rfq from public.edospmis_rfqs where id = p_rfq_id;
  if v_rfq is null then
    raise exception 'That RFQ could not be found.';
  end if;
  if not public.edospmis_has_permission(v_rfq.tenant_id, 'procurement.po.issue') then
    raise exception 'You do not have permission to issue a purchase order.';
  end if;
  if v_rfq.status <> 'open' then
    raise exception 'This RFQ has already been closed.';
  end if;

  select * into v_quotation from public.edospmis_quotations where id = p_quotation_id and rfq_id = p_rfq_id;
  if v_quotation is null then
    raise exception 'That quotation does not belong to this RFQ.';
  end if;

  select * into v_tenant from public.edospmis_tenants where id = v_rfq.tenant_id;
  v_po_status := case when v_tenant.requires_po_approval then 'pending_approval' else 'issued' end;
  v_case_status := case when v_tenant.requires_po_approval then 'po_approval' else 'awarded' end;

  select case_number into v_case_number from public.edospmis_cases where id = v_rfq.case_id;
  v_po_number := regexp_replace(v_case_number, '^PR', 'PO');

  insert into public.edospmis_evaluations (tenant_id, rfq_id, selected_quotation_id, notes, decided_by)
  values (v_rfq.tenant_id, p_rfq_id, p_quotation_id, p_notes, auth.uid());

  insert into public.edospmis_purchase_orders
    (tenant_id, case_id, rfq_id, supplier_id, po_number, items, total_cents, currency, status, expected_delivery_date, issued_by)
  values
    (v_rfq.tenant_id, v_rfq.case_id, p_rfq_id, v_quotation.supplier_id, v_po_number, v_rfq.items,
     v_quotation.total_cents, v_quotation.currency, v_po_status, p_expected_delivery_date, auth.uid())
  returning id into v_po_id;

  update public.edospmis_rfqs set status = 'closed' where id = p_rfq_id;
  update public.edospmis_cases
  set status = v_case_status, current_stage_key = v_case_status
  where id = v_rfq.case_id;

  insert into public.edospmis_audit_logs (tenant_id, actor_id, action, entity_type, entity_id, after)
  values (v_rfq.tenant_id, auth.uid(), case when v_tenant.requires_po_approval then 'po.pending_approval' else 'po.issued' end,
          'purchase_order', v_po_id,
          jsonb_build_object('rfq_id', p_rfq_id, 'supplier_id', v_quotation.supplier_id, 'total_cents', v_quotation.total_cents));

  return v_po_id;
end;
$$;

create or replace function public.edospmis_record_grn(p_case_id uuid, p_items jsonb, p_notes text)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_case record;
  v_po record;
  v_case_number text;
  v_grn_number text;
  v_seq int;
  v_grn_id uuid;
  v_item jsonb;
begin
  select * into v_case from public.edospmis_cases where id = p_case_id;
  if v_case is null then
    raise exception 'That case could not be found.';
  end if;
  if not public.edospmis_has_permission(v_case.tenant_id, 'receiving.grn.create') then
    raise exception 'You do not have permission to record goods received.';
  end if;
  if v_case.status not in ('awarded', 'receiving') then
    raise exception 'This case has no awarded purchase order to receive against.';
  end if;
  if jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one item.';
  end if;

  select * into v_po from public.edospmis_purchase_orders where case_id = p_case_id;
  if v_po is null then
    raise exception 'This case has no purchase order.';
  end if;

  select count(*) into v_seq from public.edospmis_grns where case_id = p_case_id;
  v_case_number := (select case_number from public.edospmis_cases where id = p_case_id);
  v_grn_number := regexp_replace(v_case_number, '^PR', 'GRN') || '-' || lpad((v_seq + 1)::text, 2, '0');

  insert into public.edospmis_grns (tenant_id, case_id, po_id, grn_number, notes, received_by)
  values (v_case.tenant_id, p_case_id, v_po.id, v_grn_number, p_notes, auth.uid())
  returning id into v_grn_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into public.edospmis_grn_items (grn_id, description, unit, ordered_qty, received_qty, condition, notes)
    values (
      v_grn_id,
      v_item ->> 'description',
      v_item ->> 'unit',
      coalesce((v_item ->> 'ordered_qty')::numeric, 0),
      coalesce((v_item ->> 'received_qty')::numeric, 0),
      coalesce(v_item ->> 'condition', 'accepted'),
      nullif(v_item ->> 'notes', '')
    );
  end loop;

  if v_case.status = 'awarded' then
    update public.edospmis_cases
    set status = 'receiving', current_stage_key = 'receiving'
    where id = p_case_id;
  end if;

  insert into public.edospmis_audit_logs (tenant_id, actor_id, action, entity_type, entity_id, after)
  values (v_case.tenant_id, auth.uid(), 'grn.recorded', 'grn', v_grn_id,
          jsonb_build_object('case_id', p_case_id, 'grn_number', v_grn_number));

  return v_grn_id;
end;
$$;
