-- ──────────────────────────────────────────────────────────────────────
-- When a purchase order became authorised to send to the supplier.
--
-- The procure-to-receive cycle-time report asks how long a request spent
-- waiting at each gate, and one of those gates had no timestamp at all.
-- `edospmis_approve_po` moved the order from 'pending_approval' to 'issued'
-- and recorded the fact only in the audit log; `issued_at` and `created_at`
-- both default to now() at insert, so neither says anything about approval —
-- measuring against either would have reported every PO as approved the
-- instant it was raised.
--
-- One definition, both configurations: `approved_at` is the moment the order
-- became authorised to send.
--   * Tenant requires PO approval -> when someone with procurement.po.approve
--     approved it. Null while it is still pending, which is the honest answer
--     to "when was this approved".
--   * Tenant does not -> the moment it was issued, because in that
--     configuration issuing *is* the authorisation. Recording null there
--     would read as "never approved" for an order that was authorised by
--     whoever raised it, under a policy that says that is enough.
-- ──────────────────────────────────────────────────────────────────────

alter table public.edospmis_purchase_orders
  add column if not exists approved_at timestamptz;

comment on column public.edospmis_purchase_orders.approved_at is
  'When this order became authorised to send to the supplier: the PO approval decision where the tenant requires one, otherwise the moment it was issued. Null while an order is still pending approval.';

-- ── Backfill ──────────────────────────────────────────────────────────
-- Existing rows: prefer the audit log, which recorded the approval even
-- though the table did not. Everything else that is already issued was
-- issued without a gate, so its authorisation is its issue.

update public.edospmis_purchase_orders po
set approved_at = a.created_at
from (
  select entity_id, min(created_at) as created_at
  from public.edospmis_audit_logs
  where action = 'po.approved' and entity_type = 'purchase_order'
  group by entity_id
) a
where a.entity_id = po.id and po.approved_at is null;

update public.edospmis_purchase_orders
set approved_at = issued_at
where approved_at is null and status <> 'pending_approval';

-- ── Stamp it going forward ────────────────────────────────────────────
-- Both functions are recreated whole rather than patched: `create or
-- replace` needs the full body, and a partial rewrite here is how the
-- award function lost its expected-delivery argument in 0009.

create or replace function public.edospmis_approve_po(p_po_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_po record;
begin
  select * into v_po from public.edospmis_purchase_orders where id = p_po_id;
  if v_po is null then
    raise exception 'That purchase order could not be found.';
  end if;
  if not public.edospmis_has_permission(v_po.tenant_id, 'procurement.po.approve') then
    raise exception 'You do not have permission to approve purchase orders.';
  end if;
  if v_po.status <> 'pending_approval' then
    raise exception 'This purchase order is not awaiting approval.';
  end if;

  update public.edospmis_purchase_orders
  set status = 'issued', approved_at = now()
  where id = p_po_id;

  update public.edospmis_cases set status = 'awarded', current_stage_key = 'awarded' where id = v_po.case_id;

  insert into public.edospmis_audit_logs (tenant_id, actor_id, action, entity_type, entity_id, after)
  values (v_po.tenant_id, auth.uid(), 'po.approved', 'purchase_order', p_po_id, jsonb_build_object('case_id', v_po.case_id));
end;
$$;

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
  v_approved_at timestamptz;
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
  -- No approval gate means issuing is the authorisation; with a gate, this
  -- stays null until edospmis_approve_po sets it.
  v_approved_at := case when v_tenant.requires_po_approval then null else now() end;

  select case_number into v_case_number from public.edospmis_cases where id = v_rfq.case_id;
  v_po_number := regexp_replace(v_case_number, '^PR', 'PO');

  insert into public.edospmis_evaluations (tenant_id, rfq_id, selected_quotation_id, notes, decided_by)
  values (v_rfq.tenant_id, p_rfq_id, p_quotation_id, p_notes, auth.uid());

  insert into public.edospmis_purchase_orders
    (tenant_id, case_id, rfq_id, supplier_id, po_number, items, total_cents, currency, status, expected_delivery_date, issued_by, approved_at)
  values
    (v_rfq.tenant_id, v_rfq.case_id, p_rfq_id, v_quotation.supplier_id, v_po_number, v_rfq.items,
     v_quotation.total_cents, v_quotation.currency, v_po_status, p_expected_delivery_date, auth.uid(), v_approved_at)
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
