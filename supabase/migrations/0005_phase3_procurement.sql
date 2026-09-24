-- EDOSPMIS Phase 3a — Procurement: RFQ → Quotation → Evaluation → PO.
--
-- Scope cuts, same honesty discipline as every prior migration:
--   - One RFQ per case, at most one awarded PO per RFQ. Multi-lot/
--     multi-award RFQs (splitting one RFQ across several suppliers) are a
--     real Phase-3-follow-up, not needed to prove the case can travel all
--     the way from PR to an issued PO.
--   - RFQ items default from the PR's own jsonb items (same
--     items-as-jsonb simplification Phase 2 made), editable only by
--     creating a fresh RFQ — no line-item-level RFQ editing UI yet.
--   - Quotations are staff-recorded (what a supplier sent back by email/
--     phone/portal), not received through a supplier self-service portal
--     — PRD FR-26 already marks that P2/deferred.
--   - Evaluation is "pick a winner with a note", not the fully generic
--     weighted multi-criteria scoring model ARCHITECTURE.md §21 describes.
--     Revisit once a tenant's procurement actually needs scored,
--     multi-evaluator comparison rather than one officer's judgment call.
--   - PO creation and issuance are one combined action
--     (edospmis_award_po), not the separate draft/approve/issue steps PRD
--     §22 lists — segregation of duties here is a near-term follow-up,
--     consistent with how Phase 2 also started with a single default
--     approval step before rules got richer.
--   - PO numbering reuses the case's own number with "CASE" replaced by
--     "PO" (e.g. CASE-2026-000005 -> PO-2026-000005) rather than a
--     parallel sequence — cosmetic only if a tenant's numbering_format
--     doesn't contain the literal word "CASE"; still unique either way
--     since it lives in its own table.

create table public.edospmis_suppliers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.edospmis_tenants (id) on delete cascade,
  name text not null,
  email text,
  phone text,
  category_id uuid references public.edospmis_categories (id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.edospmis_rfqs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.edospmis_tenants (id) on delete cascade,
  case_id uuid not null references public.edospmis_cases (id) on delete cascade,
  title text not null,
  items jsonb not null default '[]'::jsonb,
  closing_date date,
  status text not null default 'open' check (status in ('open', 'closed', 'cancelled')),
  created_by uuid references public.edospmis_users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (case_id)
);

create table public.edospmis_rfq_suppliers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.edospmis_tenants (id) on delete cascade,
  rfq_id uuid not null references public.edospmis_rfqs (id) on delete cascade,
  supplier_id uuid not null references public.edospmis_suppliers (id) on delete cascade,
  invited_at timestamptz not null default now(),
  unique (rfq_id, supplier_id)
);

create table public.edospmis_quotations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.edospmis_tenants (id) on delete cascade,
  rfq_id uuid not null references public.edospmis_rfqs (id) on delete cascade,
  supplier_id uuid not null references public.edospmis_suppliers (id) on delete cascade,
  total_cents bigint not null,
  currency text not null default 'KES',
  notes text,
  submitted_at date not null default current_date,
  created_by uuid references public.edospmis_users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.edospmis_evaluations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.edospmis_tenants (id) on delete cascade,
  rfq_id uuid not null references public.edospmis_rfqs (id) on delete cascade,
  selected_quotation_id uuid not null references public.edospmis_quotations (id),
  notes text,
  decided_by uuid references public.edospmis_users (id) on delete set null,
  decided_at timestamptz not null default now(),
  unique (rfq_id)
);

create table public.edospmis_purchase_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.edospmis_tenants (id) on delete cascade,
  case_id uuid not null references public.edospmis_cases (id) on delete cascade,
  rfq_id uuid references public.edospmis_rfqs (id) on delete set null,
  supplier_id uuid not null references public.edospmis_suppliers (id),
  po_number text not null,
  items jsonb not null default '[]'::jsonb,
  total_cents bigint not null,
  currency text not null default 'KES',
  status text not null default 'issued' check (status in ('issued', 'cancelled')),
  issued_by uuid references public.edospmis_users (id) on delete set null,
  issued_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (tenant_id, po_number)
);

create index edospmis_rfq_suppliers_rfq_idx on public.edospmis_rfq_suppliers (rfq_id);
create index edospmis_quotations_rfq_idx on public.edospmis_quotations (rfq_id);
create index edospmis_purchase_orders_case_idx on public.edospmis_purchase_orders (case_id);

insert into public.edospmis_permissions (key, category, description) values
  ('procurement.supplier.manage', 'procurement', 'Create and edit suppliers');

-- ── RLS ───────────────────────────────────────────────────────────────

alter table public.edospmis_suppliers enable row level security;
alter table public.edospmis_rfqs enable row level security;
alter table public.edospmis_rfq_suppliers enable row level security;
alter table public.edospmis_quotations enable row level security;
alter table public.edospmis_evaluations enable row level security;
alter table public.edospmis_purchase_orders enable row level security;

create policy edospmis_suppliers_select on public.edospmis_suppliers
  for select using (public.edospmis_is_member(tenant_id));
create policy edospmis_suppliers_write on public.edospmis_suppliers
  for all using (public.edospmis_has_permission(tenant_id, 'procurement.supplier.manage'))
  with check (public.edospmis_has_permission(tenant_id, 'procurement.supplier.manage'));

create policy edospmis_rfqs_select on public.edospmis_rfqs
  for select using (public.edospmis_is_member(tenant_id));
-- No write policy: RFQs are only ever created by edospmis_start_procurement
-- and closed by edospmis_award_po, both security definer.

create policy edospmis_rfq_suppliers_select on public.edospmis_rfq_suppliers
  for select using (public.edospmis_is_member(tenant_id));
create policy edospmis_rfq_suppliers_write on public.edospmis_rfq_suppliers
  for all using (public.edospmis_has_permission(tenant_id, 'procurement.rfq.send'))
  with check (public.edospmis_has_permission(tenant_id, 'procurement.rfq.send'));

create policy edospmis_quotations_select on public.edospmis_quotations
  for select using (public.edospmis_is_member(tenant_id));
create policy edospmis_quotations_write on public.edospmis_quotations
  for all using (public.edospmis_has_permission(tenant_id, 'procurement.rfq.send'))
  with check (public.edospmis_has_permission(tenant_id, 'procurement.rfq.send'));

create policy edospmis_evaluations_select on public.edospmis_evaluations
  for select using (public.edospmis_is_member(tenant_id));
-- No write policy: only edospmis_award_po writes here.

create policy edospmis_purchase_orders_select on public.edospmis_purchase_orders
  for select using (public.edospmis_is_member(tenant_id));
-- No write policy: only edospmis_award_po writes here.

-- ── Extend case lifecycle past "approved" ────────────────────────────────

alter table public.edospmis_cases drop constraint edospmis_cases_status_check;
alter table public.edospmis_cases add constraint edospmis_cases_status_check
  check (status in ('draft', 'submitted', 'approval', 'approved', 'rejected', 'returned', 'cancelled',
                     'procurement', 'awarded'));

-- ── Start procurement: opens the RFQ, moves the case forward ────────────

create or replace function public.edospmis_start_procurement(p_case_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_case record;
  v_pr record;
  v_rfq_id uuid;
begin
  select * into v_case from public.edospmis_cases where id = p_case_id;
  if v_case is null then
    raise exception 'That case could not be found.';
  end if;
  if not public.edospmis_has_permission(v_case.tenant_id, 'procurement.rfq.create') then
    raise exception 'You do not have permission to start procurement.';
  end if;
  if v_case.status <> 'approved' then
    raise exception 'This case is not ready for procurement yet.';
  end if;

  select * into v_pr from public.edospmis_prs where case_id = p_case_id;
  if v_pr is null then
    raise exception 'This case has no request to procure against.';
  end if;

  insert into public.edospmis_rfqs (tenant_id, case_id, title, items, created_by)
  values (v_case.tenant_id, p_case_id, v_pr.title, v_pr.items, auth.uid())
  returning id into v_rfq_id;

  update public.edospmis_cases
  set status = 'procurement', current_stage_key = 'procurement'
  where id = p_case_id;

  insert into public.edospmis_audit_logs (tenant_id, actor_id, action, entity_type, entity_id, after)
  values (v_case.tenant_id, auth.uid(), 'procurement.started', 'rfq', v_rfq_id, jsonb_build_object('case_id', p_case_id));

  return v_rfq_id;
end;
$$;

-- ── Award: picks the winning quotation, issues the PO, closes the RFQ ──

create or replace function public.edospmis_award_po(p_rfq_id uuid, p_quotation_id uuid, p_notes text)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_rfq record;
  v_quotation record;
  v_case_number text;
  v_po_number text;
  v_po_id uuid;
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

  select case_number into v_case_number from public.edospmis_cases where id = v_rfq.case_id;
  v_po_number := regexp_replace(v_case_number, '^CASE', 'PO');

  insert into public.edospmis_evaluations (tenant_id, rfq_id, selected_quotation_id, notes, decided_by)
  values (v_rfq.tenant_id, p_rfq_id, p_quotation_id, p_notes, auth.uid());

  insert into public.edospmis_purchase_orders
    (tenant_id, case_id, rfq_id, supplier_id, po_number, items, total_cents, currency, issued_by)
  values
    (v_rfq.tenant_id, v_rfq.case_id, p_rfq_id, v_quotation.supplier_id, v_po_number, v_rfq.items,
     v_quotation.total_cents, v_quotation.currency, auth.uid())
  returning id into v_po_id;

  update public.edospmis_rfqs set status = 'closed' where id = p_rfq_id;
  update public.edospmis_cases
  set status = 'awarded', current_stage_key = 'awarded'
  where id = v_rfq.case_id;

  insert into public.edospmis_audit_logs (tenant_id, actor_id, action, entity_type, entity_id, after)
  values (v_rfq.tenant_id, auth.uid(), 'po.issued', 'purchase_order', v_po_id,
          jsonb_build_object('rfq_id', p_rfq_id, 'supplier_id', v_quotation.supplier_id, 'total_cents', v_quotation.total_cents));

  return v_po_id;
end;
$$;

-- ── Extend tenant provisioning: procurement permissions + workflow stages

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
  where key like 'delivery.%';

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

  -- Now carries through to "Awarded" — procurement/fulfilment/finance
  -- stages beyond that are still Phase 4/5 work.
  insert into public.edospmis_workflow_versions (workflow_id, version_number, definition)
  values (v_workflow_id, 1, jsonb_build_object(
    'stages', jsonb_build_array(
      jsonb_build_object('key', 'draft', 'label', 'Draft'),
      jsonb_build_object('key', 'approval', 'label', 'Approval'),
      jsonb_build_object('key', 'approved', 'label', 'Approved'),
      jsonb_build_object('key', 'procurement', 'label', 'Procurement'),
      jsonb_build_object('key', 'awarded', 'label', 'Awarded')
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
