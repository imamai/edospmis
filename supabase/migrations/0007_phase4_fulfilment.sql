-- EDOSPMIS Phase 4 — Fulfilment: Receiving (GRN + Inspection), Delivery,
-- and formal Case closure.
--
-- Scope cuts, same honesty discipline as every prior migration:
--   - GRN items are recorded from the PO's own jsonb items (same
--     items-as-jsonb simplification Phase 2/3 already made for PR/RFQ/PO
--     items) rather than a normalized edospmis_po_items table — a receiving
--     officer types the received qty/condition against each PO line, no
--     independent GRN-item querying (e.g. cross-case inventory rollups) yet.
--   - One delivery per case (`unique (case_id)` on edospmis_deliveries) —
--     a case that ships in several batches is real follow-up work, not
--     needed to prove a case can travel all the way to Completed. Same cut
--     shape as Phase 3's "one RFQ per case, at most one awarded PO per RFQ".
--   - Inspection is one pass/fail/conditional outcome per GRN, not a
--     per-item inspection or a re-inspection history — ARCHITECTURE.md
--     §1.2's `edospmis_inspections` table is honoured, its "evidence via
--     edospmis_documents" is not: no file upload here yet, so evidence is a
--     free-text reference (e.g. a report number or photo filename kept
--     elsewhere) rather than an attached document. Real, separate follow-up
--     work — file/document storage is a cross-cutting need (contracts,
--     inspections, deliveries all want it), better built once, not bolted
--     onto this migration alone.
--   - Delivery "client confirmation" is staff-recorded (what the client
--     told them, over phone/in person/on a physical delivery note), not
--     captured through a client self-service portal — the same stand-in
--     shape Phase 3's contract-signature recording already uses, and for
--     the same reason (no Client Portal yet, see Phase 2's migration
--     header).
--   - Closing a case is a manual, explicit staff action gated only by
--     permission and the case not already being in a terminal state — it
--     is NOT hard-blocked on "delivery confirmed", because a case can
--     legitimately end at goods-accepted-no-physical-delivery (e.g. a
--     services-only PR, or a client collecting in person). The Case detail
--     screen nudges toward closing only after delivery is confirmed; it
--     never refuses the button. Revisit with tenant-configurable closure
--     rules (ARCHITECTURE.md §10.4/PRD roadmap item) once a tenant actually
--     needs to enforce a stricter sequence than "someone with the
--     permission signed off".

-- ── Receiving: GRN + GRN items + Inspection ──────────────────────────────

create table public.edospmis_grns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.edospmis_tenants (id) on delete cascade,
  case_id uuid not null references public.edospmis_cases (id) on delete cascade,
  po_id uuid not null references public.edospmis_purchase_orders (id) on delete cascade,
  grn_number text not null,
  status text not null default 'recorded' check (status in ('recorded', 'inspected')),
  notes text,
  received_by uuid references public.edospmis_users (id) on delete set null,
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (tenant_id, grn_number)
);

create table public.edospmis_grn_items (
  id uuid primary key default gen_random_uuid(),
  grn_id uuid not null references public.edospmis_grns (id) on delete cascade,
  description text not null,
  unit text,
  ordered_qty numeric not null default 0,
  received_qty numeric not null default 0,
  condition text not null default 'accepted' check (condition in ('accepted', 'rejected', 'damaged', 'short', 'over')),
  notes text
);

create table public.edospmis_inspections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.edospmis_tenants (id) on delete cascade,
  grn_id uuid not null references public.edospmis_grns (id) on delete cascade,
  result text not null check (result in ('pass', 'fail', 'conditional')),
  comments text,
  evidence_ref text,
  inspected_by uuid references public.edospmis_users (id) on delete set null,
  inspected_at timestamptz not null default now(),
  unique (grn_id)
);

-- ── Delivery / Service ────────────────────────────────────────────────

create table public.edospmis_deliveries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.edospmis_tenants (id) on delete cascade,
  case_id uuid not null references public.edospmis_cases (id) on delete cascade,
  status text not null default 'scheduled' check (status in ('scheduled', 'dispatched', 'delivered', 'confirmed', 'cancelled')),
  scheduled_at timestamptz,
  dispatched_at timestamptz,
  delivered_at timestamptz,
  proof_type text check (proof_type in ('signature', 'photo', 'otp', 'none')),
  proof_ref text,
  client_confirmed_at timestamptz,
  notes text,
  created_by uuid references public.edospmis_users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (case_id)
);

create index edospmis_grns_case_idx on public.edospmis_grns (case_id);
create index edospmis_grn_items_grn_idx on public.edospmis_grn_items (grn_id);
create index edospmis_inspections_grn_idx on public.edospmis_inspections (grn_id);

-- ── New permission: closing a case is its own act, distinct from any one
--    stage's own permission ────────────────────────────────────────────

insert into public.edospmis_permissions (key, category, description) values
  ('procurement.case.close', 'procurement', 'Close a case once its work is complete');

-- ── RLS ───────────────────────────────────────────────────────────────

alter table public.edospmis_grns enable row level security;
alter table public.edospmis_grn_items enable row level security;
alter table public.edospmis_inspections enable row level security;
alter table public.edospmis_deliveries enable row level security;

create policy edospmis_grns_select on public.edospmis_grns
  for select using (public.edospmis_is_member(tenant_id));
-- No write policy: only edospmis_record_grn (security definer) writes here.

create policy edospmis_grn_items_select on public.edospmis_grn_items
  for select using (
    exists (select 1 from public.edospmis_grns g where g.id = grn_id and public.edospmis_is_member(g.tenant_id))
  );
-- No write policy: only edospmis_record_grn writes here.

create policy edospmis_inspections_select on public.edospmis_inspections
  for select using (public.edospmis_is_member(tenant_id));
-- No write policy: only edospmis_record_inspection writes here.

create policy edospmis_deliveries_select on public.edospmis_deliveries
  for select using (public.edospmis_is_member(tenant_id));
-- No write policy: only edospmis_schedule_delivery / edospmis_dispatch_delivery /
-- edospmis_confirm_delivery write here.

-- ── Extend case lifecycle past "awarded" ────────────────────────────────

alter table public.edospmis_cases drop constraint edospmis_cases_status_check;
alter table public.edospmis_cases add constraint edospmis_cases_status_check
  check (status in ('draft', 'submitted', 'approval', 'approved', 'rejected', 'returned', 'cancelled',
                     'procurement', 'awarded', 'receiving', 'delivery', 'closed'));

-- ── Record a GRN: receipt against the case's awarded PO ─────────────────

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
  v_grn_number := regexp_replace(v_case_number, '^CASE', 'GRN') || '-' || lpad((v_seq + 1)::text, 2, '0');

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

-- ── Record an inspection outcome for a GRN ──────────────────────────────

create or replace function public.edospmis_record_inspection(p_grn_id uuid, p_result text, p_comments text, p_evidence_ref text)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_grn record;
  v_inspection_id uuid;
begin
  if p_result not in ('pass', 'fail', 'conditional') then
    raise exception 'Invalid inspection result.';
  end if;

  select * into v_grn from public.edospmis_grns where id = p_grn_id;
  if v_grn is null then
    raise exception 'That goods-received note could not be found.';
  end if;
  if not public.edospmis_has_permission(v_grn.tenant_id, 'receiving.grn.approve') then
    raise exception 'You do not have permission to inspect goods received.';
  end if;
  if v_grn.status = 'inspected' then
    raise exception 'This goods-received note has already been inspected.';
  end if;

  insert into public.edospmis_inspections (tenant_id, grn_id, result, comments, evidence_ref, inspected_by)
  values (v_grn.tenant_id, p_grn_id, p_result, p_comments, p_evidence_ref, auth.uid())
  returning id into v_inspection_id;

  update public.edospmis_grns set status = 'inspected' where id = p_grn_id;

  insert into public.edospmis_audit_logs (tenant_id, actor_id, action, entity_type, entity_id, after)
  values (v_grn.tenant_id, auth.uid(), 'grn.inspected', 'inspection', v_inspection_id,
          jsonb_build_object('grn_id', p_grn_id, 'result', p_result));

  return v_inspection_id;
end;
$$;

-- ── Schedule a delivery (or service completion date) for a case ─────────

create or replace function public.edospmis_schedule_delivery(p_case_id uuid, p_scheduled_at timestamptz, p_notes text)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_case record;
  v_delivery_id uuid;
begin
  select * into v_case from public.edospmis_cases where id = p_case_id;
  if v_case is null then
    raise exception 'That case could not be found.';
  end if;
  if not public.edospmis_has_permission(v_case.tenant_id, 'delivery.assign') then
    raise exception 'You do not have permission to schedule a delivery.';
  end if;
  if v_case.status not in ('awarded', 'receiving', 'delivery') then
    raise exception 'This case is not ready to schedule delivery yet.';
  end if;

  insert into public.edospmis_deliveries (tenant_id, case_id, scheduled_at, notes, created_by)
  values (v_case.tenant_id, p_case_id, p_scheduled_at, p_notes, auth.uid())
  on conflict (case_id) do update
    set scheduled_at = excluded.scheduled_at, notes = excluded.notes
    where public.edospmis_deliveries.status = 'scheduled'
  returning id into v_delivery_id;

  if v_delivery_id is null then
    raise exception 'This case''s delivery has already moved past scheduling.';
  end if;

  if v_case.status in ('awarded', 'receiving') then
    update public.edospmis_cases
    set status = 'delivery', current_stage_key = 'delivery'
    where id = p_case_id;
  end if;

  insert into public.edospmis_audit_logs (tenant_id, actor_id, action, entity_type, entity_id, after)
  values (v_case.tenant_id, auth.uid(), 'delivery.scheduled', 'delivery', v_delivery_id,
          jsonb_build_object('case_id', p_case_id, 'scheduled_at', p_scheduled_at));

  return v_delivery_id;
end;
$$;

-- ── Dispatch a scheduled delivery ─────────────────────────────────────

create or replace function public.edospmis_dispatch_delivery(p_delivery_id uuid)
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
  if not public.edospmis_has_permission(v_delivery.tenant_id, 'delivery.dispatch') then
    raise exception 'You do not have permission to dispatch a delivery.';
  end if;
  if v_delivery.status <> 'scheduled' then
    raise exception 'This delivery has already been dispatched.';
  end if;

  update public.edospmis_deliveries set status = 'dispatched', dispatched_at = now() where id = p_delivery_id;

  insert into public.edospmis_audit_logs (tenant_id, actor_id, action, entity_type, entity_id, after)
  values (v_delivery.tenant_id, auth.uid(), 'delivery.dispatched', 'delivery', p_delivery_id,
          jsonb_build_object('case_id', v_delivery.case_id));
end;
$$;

-- ── Confirm delivery: staff records proof + the client's confirmation ───

create or replace function public.edospmis_confirm_delivery(p_delivery_id uuid, p_proof_type text, p_proof_ref text, p_notes text)
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
end;
$$;

-- ── Close a case ──────────────────────────────────────────────────────

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

  insert into public.edospmis_audit_logs (tenant_id, actor_id, action, entity_type, entity_id, reason)
  values (v_case.tenant_id, auth.uid(), 'case.closed', 'case', p_case_id, p_reason);
end;
$$;

-- ── Extend tenant provisioning: fulfilment stages + case-close permission

create or replace function public.edospmis_provision_tenant(p_tenant_name text, p_tenant_slug text)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_tenant_id uuid;
  v_role_admin uuid;
  v_role_proc_mgr uuid;
  v_role_proc_officer uuid;
  v_role_dept_mgr uuid;
  v_role_requester uuid;
  v_role_approver uuid;
  v_role_finance_officer uuid;
  v_role_finance_mgr uuid;
  v_role_receiving uuid;
  v_role_delivery uuid;
  v_role_auditor uuid;
  v_role_executive uuid;
  v_role_lawyer uuid;
  v_workflow_id uuid;
  v_workflow_version_id uuid;
  v_rule_id uuid;
begin
  if exists (select 1 from public.edospmis_tenants where slug = p_tenant_slug) then
    raise exception 'That workspace URL is already taken.' using errcode = 'unique_violation';
  end if;

  perform public.edospmis_ensure_profile();

  insert into public.edospmis_tenants (name, slug) values (p_tenant_name, p_tenant_slug)
  returning id into v_tenant_id;

  insert into public.edospmis_memberships (user_id, tenant_id, status)
  values (auth.uid(), v_tenant_id, 'active');

  insert into public.edospmis_roles (tenant_id, name, description, is_system)
  values (v_tenant_id, 'Tenant Administrator', 'Full control of this workspace.', true)
  returning id into v_role_admin;
  insert into public.edospmis_role_permissions (role_id, permission_id)
  select v_role_admin, id from public.edospmis_permissions;

  insert into public.edospmis_roles (tenant_id, name, description, is_system) values
    (v_tenant_id, 'Procurement Manager', 'Oversees the procurement pipeline and spend.', true) returning id into v_role_proc_mgr;
  insert into public.edospmis_role_permissions (role_id, permission_id)
  select v_role_proc_mgr, id from public.edospmis_permissions
  where key like 'procurement.%' or key in ('reports.view', 'reports.export', 'crm.client.manage');

  insert into public.edospmis_roles (tenant_id, name, description, is_system) values
    (v_tenant_id, 'Procurement Officer', 'Runs RFQs and builds purchase orders.', true) returning id into v_role_proc_officer;
  insert into public.edospmis_role_permissions (role_id, permission_id)
  select v_role_proc_officer, id from public.edospmis_permissions
  where key in ('procurement.pr.view', 'procurement.rfq.create', 'procurement.rfq.view',
                'procurement.rfq.send', 'procurement.rfq.evaluate', 'procurement.po.create', 'procurement.po.view',
                'procurement.po.issue', 'procurement.supplier.manage', 'crm.client.manage');

  insert into public.edospmis_roles (tenant_id, name, description, is_system) values
    (v_tenant_id, 'Department Manager', 'First-line approver for their department''s requests.', true) returning id into v_role_dept_mgr;
  insert into public.edospmis_role_permissions (role_id, permission_id)
  select v_role_dept_mgr, id from public.edospmis_permissions
  where key in ('procurement.pr.view', 'procurement.pr.approve', 'procurement.pr.reject',
                'procurement.pr.return', 'reports.view');

  insert into public.edospmis_roles (tenant_id, name, description, is_system) values
    (v_tenant_id, 'Requester', 'Raises requests and tracks their own.', true) returning id into v_role_requester;
  insert into public.edospmis_role_permissions (role_id, permission_id)
  select v_role_requester, id from public.edospmis_permissions
  where key in ('procurement.pr.create', 'procurement.pr.view', 'procurement.pr.submit', 'procurement.pr.edit');

  insert into public.edospmis_roles (tenant_id, name, description, is_system) values
    (v_tenant_id, 'Approver', 'Approves requests routed to them.', true) returning id into v_role_approver;
  insert into public.edospmis_role_permissions (role_id, permission_id)
  select v_role_approver, id from public.edospmis_permissions
  where key in ('procurement.pr.view', 'procurement.pr.approve', 'procurement.pr.reject', 'procurement.pr.return');

  insert into public.edospmis_roles (tenant_id, name, description, is_system) values
    (v_tenant_id, 'Finance Officer', 'Handles invoices and matching.', true) returning id into v_role_finance_officer;
  insert into public.edospmis_role_permissions (role_id, permission_id)
  select v_role_finance_officer, id from public.edospmis_permissions
  where key in ('finance.invoice.view');

  insert into public.edospmis_roles (tenant_id, name, description, is_system) values
    (v_tenant_id, 'Finance Manager', 'Approves invoices and payments.', true) returning id into v_role_finance_mgr;
  insert into public.edospmis_role_permissions (role_id, permission_id)
  select v_role_finance_mgr, id from public.edospmis_permissions
  where key in ('finance.invoice.view', 'finance.invoice.approve', 'finance.payment.approve', 'reports.view');

  insert into public.edospmis_roles (tenant_id, name, description, is_system) values
    (v_tenant_id, 'Receiving Officer', 'Logs goods received against purchase orders.', true) returning id into v_role_receiving;
  insert into public.edospmis_role_permissions (role_id, permission_id)
  select v_role_receiving, id from public.edospmis_permissions
  where key like 'receiving.%';

  insert into public.edospmis_roles (tenant_id, name, description, is_system) values
    (v_tenant_id, 'Delivery Officer', 'Executes final delivery or service to the client.', true) returning id into v_role_delivery;
  insert into public.edospmis_role_permissions (role_id, permission_id)
  select v_role_delivery, id from public.edospmis_permissions
  where key like 'delivery.%' or key = 'procurement.case.close';

  insert into public.edospmis_roles (tenant_id, name, description, is_system) values
    (v_tenant_id, 'Auditor', 'Read-only oversight of the full audit trail.', true) returning id into v_role_auditor;
  insert into public.edospmis_role_permissions (role_id, permission_id)
  select v_role_auditor, id from public.edospmis_permissions
  where key in ('reports.view', 'reports.export', 'admin.audit.view');

  insert into public.edospmis_roles (tenant_id, name, description, is_system) values
    (v_tenant_id, 'Executive', 'Read-only spend and performance visibility.', true) returning id into v_role_executive;
  insert into public.edospmis_role_permissions (role_id, permission_id)
  select v_role_executive, id from public.edospmis_permissions
  where key in ('reports.view', 'reports.export');

  insert into public.edospmis_roles (tenant_id, name, description, is_system) values
    (v_tenant_id, 'Lawyer / Advocate', 'Drafts, sends and tracks contracts provisioned to clients.', true) returning id into v_role_lawyer;
  insert into public.edospmis_role_permissions (role_id, permission_id)
  select v_role_lawyer, id from public.edospmis_permissions
  where key like 'legal.%' or key = 'crm.client.manage';

  insert into public.edospmis_user_roles (user_id, tenant_id, role_id, scope_type)
  values (auth.uid(), v_tenant_id, v_role_admin, 'tenant');
  insert into public.edospmis_user_roles (user_id, tenant_id, role_id, scope_type)
  values (auth.uid(), v_tenant_id, v_role_dept_mgr, 'tenant');

  update public.edospmis_users set last_tenant_id = v_tenant_id where id = auth.uid();

  insert into public.edospmis_categories (tenant_id, name) values
    (v_tenant_id, 'Goods'), (v_tenant_id, 'Services'), (v_tenant_id, 'Works');

  insert into public.edospmis_workflows (tenant_id, name, is_default)
  values (v_tenant_id, 'Standard Procurement', true)
  returning id into v_workflow_id;

  -- Now carries all the way to "Completed" — the full chevron
  -- ARCHITECTURE.md §10.2 describes, minus the "Finance" stage (Phase 5).
  insert into public.edospmis_workflow_versions (workflow_id, version_number, definition)
  values (v_workflow_id, 1, jsonb_build_object(
    'stages', jsonb_build_array(
      jsonb_build_object('key', 'draft', 'label', 'Draft'),
      jsonb_build_object('key', 'approval', 'label', 'Approval'),
      jsonb_build_object('key', 'approved', 'label', 'Approved'),
      jsonb_build_object('key', 'procurement', 'label', 'Procurement'),
      jsonb_build_object('key', 'awarded', 'label', 'Awarded'),
      jsonb_build_object('key', 'receiving', 'label', 'Receiving'),
      jsonb_build_object('key', 'delivery', 'label', 'Delivery'),
      jsonb_build_object('key', 'closed', 'label', 'Completed')
    )
  ))
  returning id into v_workflow_version_id;

  insert into public.edospmis_sla_policies (tenant_id, stage_key, target_minutes, warning_minutes, breach_minutes)
  values (v_tenant_id, 'approval', 1440, 1080, 1440);

  insert into public.edospmis_queues (tenant_id, name, stage_key)
  values (v_tenant_id, 'Approval', 'approval');

  insert into public.edospmis_approval_rules (tenant_id, name)
  values (v_tenant_id, 'Standard approval')
  returning id into v_rule_id;
  insert into public.edospmis_approval_steps (rule_id, step_order, role_id)
  values (v_rule_id, 1, v_role_dept_mgr);

  insert into public.edospmis_audit_logs (tenant_id, actor_id, action, entity_type, entity_id, after)
  values (v_tenant_id, auth.uid(), 'tenant.provisioned', 'tenant', v_tenant_id,
          jsonb_build_object('name', p_tenant_name, 'slug', p_tenant_slug));

  return v_tenant_id;
end;
$$;

-- ── Backfill: existing tenants' Delivery Officer role also gets the new
--    case-close permission, and every existing default workflow gets a new
--    version with the full stage list — so any case submitted from now on,
--    in an already-provisioned tenant, shows the complete chevron. Already-
--    awarded cases stay pinned to whichever version they started on (by
--    design — see ARCHITECTURE.md §1.2, workflow versions are immutable
--    history), which is a display-only gap, not a functional one: their
--    status and current_stage_key still advance correctly either way. ────

insert into public.edospmis_role_permissions (role_id, permission_id)
select r.id, p.id
from public.edospmis_roles r
cross join public.edospmis_permissions p
where r.name = 'Delivery Officer' and p.key = 'procurement.case.close'
on conflict do nothing;

insert into public.edospmis_role_permissions (role_id, permission_id)
select r.id, p.id
from public.edospmis_roles r
cross join public.edospmis_permissions p
where r.name = 'Procurement Manager' and p.key = 'procurement.case.close'
on conflict do nothing;

-- Tenant Administrator is seeded once, at provisioning, with "every
-- permission that exists at that moment" — so any tenant provisioned
-- before a later migration adds a new permission key is one permission
-- short of "full control of this workspace" until backfilled here. Same
-- fix, generalized to catch this migration's new key and any prior gap.
insert into public.edospmis_role_permissions (role_id, permission_id)
select r.id, p.id
from public.edospmis_roles r
cross join public.edospmis_permissions p
where r.name = 'Tenant Administrator'
on conflict do nothing;

insert into public.edospmis_workflow_versions (workflow_id, version_number, definition)
select w.id,
       coalesce((select max(version_number) from public.edospmis_workflow_versions where workflow_id = w.id), 0) + 1,
       jsonb_build_object(
         'stages', jsonb_build_array(
           jsonb_build_object('key', 'draft', 'label', 'Draft'),
           jsonb_build_object('key', 'approval', 'label', 'Approval'),
           jsonb_build_object('key', 'approved', 'label', 'Approved'),
           jsonb_build_object('key', 'procurement', 'label', 'Procurement'),
           jsonb_build_object('key', 'awarded', 'label', 'Awarded'),
           jsonb_build_object('key', 'receiving', 'label', 'Receiving'),
           jsonb_build_object('key', 'delivery', 'label', 'Delivery'),
           jsonb_build_object('key', 'closed', 'label', 'Completed')
         )
       )
from public.edospmis_workflows w
where w.is_default;
