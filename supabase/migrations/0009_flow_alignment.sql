-- EDOSPMIS Flow Alignment — closes gaps found auditing the client's real
-- 12-stage procure-to-pay diagram against a SAP Business One turnaround-time
-- export (PR/PO/GRPO day-counts). See the audit report for the full
-- stage-by-stage mapping; this migration builds the additive changes that
-- came out of it, in the shape recommended: fit into the existing pipeline
-- rather than restructure it.
--
-- Scope cuts, same honesty discipline as every prior migration:
--   - Per-stage timing is captured by a trigger on edospmis_cases, not by
--     threading a logging call through every RPC — it's the more robust
--     mechanism (works for every present and future write path, including
--     ones this migration doesn't touch) and was chosen during
--     implementation over what the audit report itself sketched.
--   - Existing cases get one backfilled history row each (their current
--     status, entered_at = opened_at) — an honest approximation, not real
--     history, since nothing recorded their earlier transitions before
--     this table existed.
--   - PO Approval is tenant-optional (`edospmis_tenants.requires_po_approval`,
--     default off) because the audit found it's a real step for this client
--     but not something every tenant needs gated.
--   - "Delivery window" (diagram stage 7, supplier -> buyer) is a single
--     `expected_delivery_date` field on the PO, not a new stage/status —
--     deliberately kept lightweight, and deliberately distinct from the
--     existing Phase 4 Delivery panel, which is the *other* direction
--     (tenant -> tenant's own client). No UI renames the existing feature
--     in this migration; that's a copy-only follow-up, not a schema change.
--   - "On hold" / "blocked" are boolean flags orthogonal to the status
--     pipeline, not new pipeline states — cheaper to add, cheaper to query,
--     and don't force every existing status-branch in every RPC to learn
--     two new values.
--   - Escalation reuses the SLA policies table Phase 2 already built
--     (it was always generic per stage_key; only the approval stage ever
--     had a row) — no new escalation schema, just live display for
--     whichever stage a tenant configures.
--   - Explicitly NOT built here: a generic "rework" state machine (the
--     system's real equivalents — a failed inspection, an invoice
--     exception — already exist and are already timestamped; formalizing
--     "send any stage back" as its own mechanism is real, separate,
--     larger work), a full analytics/reporting screen reproducing the
--     Excel report (the data this migration captures makes that possible;
--     building the screen is Phase 6), and auto-reassignment on SLA
--     breach (still real, separate work per Phase 2's own migration
--     header).

-- ── Generic per-stage timing ──────────────────────────────────────────

create table public.edospmis_case_stage_history (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.edospmis_tenants (id) on delete cascade,
  case_id uuid not null references public.edospmis_cases (id) on delete cascade,
  stage_key text not null,
  entered_at timestamptz not null default now(),
  left_at timestamptz
);

create index edospmis_case_stage_history_case_idx on public.edospmis_case_stage_history (case_id, entered_at);
create unique index edospmis_case_stage_history_open_idx on public.edospmis_case_stage_history (case_id) where left_at is null;

alter table public.edospmis_case_stage_history enable row level security;
create policy edospmis_case_stage_history_select on public.edospmis_case_stage_history
  for select using (public.edospmis_is_member(tenant_id));
-- No write policy: only the trigger function below (security definer) writes here.

create or replace function public.edospmis_log_case_stage_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.edospmis_case_stage_history (tenant_id, case_id, stage_key, entered_at)
    values (new.tenant_id, new.id, new.status, new.opened_at);
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    update public.edospmis_case_stage_history
    set left_at = now()
    where case_id = new.id and left_at is null;

    insert into public.edospmis_case_stage_history (tenant_id, case_id, stage_key)
    values (new.tenant_id, new.id, new.status);
  end if;
  return new;
end;
$$;

create trigger edospmis_case_stage_history_trg
after insert or update on public.edospmis_cases
for each row execute function public.edospmis_log_case_stage_change();

-- Backfill: one approximate row per existing case (see header note).
insert into public.edospmis_case_stage_history (tenant_id, case_id, stage_key, entered_at)
select tenant_id, id, status, opened_at
from public.edospmis_cases c
where not exists (select 1 from public.edospmis_case_stage_history h where h.case_id = c.id);

-- ── PO Approval: tenant-optional gate before a PO counts as issued ───────

alter table public.edospmis_tenants add column requires_po_approval boolean not null default false;

alter table public.edospmis_purchase_orders drop constraint edospmis_purchase_orders_status_check;
alter table public.edospmis_purchase_orders add constraint edospmis_purchase_orders_status_check
  check (status in ('pending_approval', 'issued', 'cancelled'));

alter table public.edospmis_purchase_orders add column expected_delivery_date date;

alter table public.edospmis_cases drop constraint edospmis_cases_status_check;
alter table public.edospmis_cases add constraint edospmis_cases_status_check
  check (status in ('draft', 'submitted', 'approval', 'approved', 'rejected', 'returned', 'cancelled',
                     'procurement', 'po_approval', 'awarded', 'receiving', 'finance', 'delivery', 'closed'));

-- ── On hold / Blocked: orthogonal flags, not pipeline states ─────────────

alter table public.edospmis_cases add column on_hold boolean not null default false;
alter table public.edospmis_cases add column on_hold_reason text;
alter table public.edospmis_cases add column blocked boolean not null default false;
alter table public.edospmis_cases add column blocked_reason text;

-- ── New permission: on_hold/blocked are their own act, like case.close ──

insert into public.edospmis_permissions (key, category, description) values
  ('procurement.case.hold', 'procurement', 'Put a case on hold or mark it blocked');

-- ── Award a PO: now branches on the tenant's PO-approval setting ────────
-- (dropped and recreated, not just replaced — the parameter list changed,
-- and create-or-replace with a different arity creates a second overload
-- rather than replacing the original)

drop function if exists public.edospmis_award_po(uuid, uuid, text);

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
  v_po_number := regexp_replace(v_case_number, '^CASE', 'PO');

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

-- ── Approve a pending PO (only relevant when the tenant requires it) ────

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

  update public.edospmis_purchase_orders set status = 'issued' where id = p_po_id;
  update public.edospmis_cases set status = 'awarded', current_stage_key = 'awarded' where id = v_po.case_id;

  insert into public.edospmis_audit_logs (tenant_id, actor_id, action, entity_type, entity_id, after)
  values (v_po.tenant_id, auth.uid(), 'po.approved', 'purchase_order', p_po_id, jsonb_build_object('case_id', v_po.case_id));
end;
$$;

-- ── Cancel a case (the 'cancelled' status has existed since Phase 2 with
--    no path to reach it — this closes that gap) ────────────────────────

create or replace function public.edospmis_cancel_case(p_case_id uuid, p_reason text)
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
  if not public.edospmis_has_permission(v_case.tenant_id, 'procurement.pr.cancel') then
    raise exception 'You do not have permission to cancel cases.';
  end if;
  if v_case.status in ('closed', 'rejected', 'returned', 'cancelled') then
    raise exception 'This case is already closed out.';
  end if;

  update public.edospmis_cases
  set status = 'cancelled', current_stage_key = 'cancelled', closed_at = now()
  where id = p_case_id;
  update public.edospmis_prs set status = 'cancelled' where case_id = p_case_id;

  insert into public.edospmis_audit_logs (tenant_id, actor_id, action, entity_type, entity_id, reason)
  values (v_case.tenant_id, auth.uid(), 'case.cancelled', 'case', p_case_id, p_reason);
end;
$$;

-- ── On hold / Blocked: set or clear ──────────────────────────────────────

create or replace function public.edospmis_set_case_hold(p_case_id uuid, p_on_hold boolean, p_reason text)
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
  if not public.edospmis_has_permission(v_case.tenant_id, 'procurement.case.hold') then
    raise exception 'You do not have permission to change hold status.';
  end if;

  update public.edospmis_cases
  set on_hold = p_on_hold, on_hold_reason = case when p_on_hold then p_reason else null end
  where id = p_case_id;

  insert into public.edospmis_audit_logs (tenant_id, actor_id, action, entity_type, entity_id, reason)
  values (v_case.tenant_id, auth.uid(), case when p_on_hold then 'case.held' else 'case.hold_released' end, 'case', p_case_id, p_reason);
end;
$$;

create or replace function public.edospmis_set_case_blocked(p_case_id uuid, p_blocked boolean, p_reason text)
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
  if not public.edospmis_has_permission(v_case.tenant_id, 'procurement.case.hold') then
    raise exception 'You do not have permission to change blocked status.';
  end if;

  update public.edospmis_cases
  set blocked = p_blocked, blocked_reason = case when p_blocked then p_reason else null end
  where id = p_case_id;

  insert into public.edospmis_audit_logs (tenant_id, actor_id, action, entity_type, entity_id, reason)
  values (v_case.tenant_id, auth.uid(), case when p_blocked then 'case.blocked' else 'case.unblocked' end, 'case', p_case_id, p_reason);
end;
$$;

-- ── Extend tenant provisioning: grant the (mostly pre-existing but
--    never-granted) permissions this migration finally puts to use ───────

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
                'procurement.pr.return', 'procurement.pr.cancel', 'procurement.case.hold', 'reports.view');

  insert into public.edospmis_roles (tenant_id, name, description, is_system) values
    (v_tenant_id, 'Requester', 'Raises requests and tracks their own.', true) returning id into v_role_requester;
  insert into public.edospmis_role_permissions (role_id, permission_id)
  select v_role_requester, id from public.edospmis_permissions
  where key in ('procurement.pr.create', 'procurement.pr.view', 'procurement.pr.submit', 'procurement.pr.edit', 'procurement.pr.cancel');

  insert into public.edospmis_roles (tenant_id, name, description, is_system) values
    (v_tenant_id, 'Approver', 'Approves requests routed to them.', true) returning id into v_role_approver;
  insert into public.edospmis_role_permissions (role_id, permission_id)
  select v_role_approver, id from public.edospmis_permissions
  where key in ('procurement.pr.view', 'procurement.pr.approve', 'procurement.pr.reject', 'procurement.pr.return');

  insert into public.edospmis_roles (tenant_id, name, description, is_system) values
    (v_tenant_id, 'Finance Officer', 'Handles invoices and matching.', true) returning id into v_role_finance_officer;
  insert into public.edospmis_role_permissions (role_id, permission_id)
  select v_role_finance_officer, id from public.edospmis_permissions
  where key in ('finance.invoice.view', 'finance.invoice.create');

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

  insert into public.edospmis_sod_settings (tenant_id) values (v_tenant_id);

  insert into public.edospmis_workflows (tenant_id, name, is_default)
  values (v_tenant_id, 'Standard Procurement', true)
  returning id into v_workflow_id;

  insert into public.edospmis_workflow_versions (workflow_id, version_number, definition)
  values (v_workflow_id, 1, jsonb_build_object(
    'stages', jsonb_build_array(
      jsonb_build_object('key', 'draft', 'label', 'Draft'),
      jsonb_build_object('key', 'approval', 'label', 'Approval'),
      jsonb_build_object('key', 'approved', 'label', 'Approved'),
      jsonb_build_object('key', 'procurement', 'label', 'Procurement'),
      jsonb_build_object('key', 'awarded', 'label', 'Awarded'),
      jsonb_build_object('key', 'receiving', 'label', 'Receiving'),
      jsonb_build_object('key', 'finance', 'label', 'Finance'),
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

-- ── Backfill for tenants provisioned before this migration ───────────────

insert into public.edospmis_role_permissions (role_id, permission_id)
select r.id, p.id
from public.edospmis_roles r
cross join public.edospmis_permissions p
where r.name in ('Department Manager', 'Requester') and p.key = 'procurement.pr.cancel'
on conflict do nothing;

insert into public.edospmis_role_permissions (role_id, permission_id)
select r.id, p.id
from public.edospmis_roles r
cross join public.edospmis_permissions p
where r.name = 'Department Manager' and p.key = 'procurement.case.hold'
on conflict do nothing;

insert into public.edospmis_role_permissions (role_id, permission_id)
select r.id, p.id
from public.edospmis_roles r
cross join public.edospmis_permissions p
where r.name = 'Procurement Manager' and p.key = 'procurement.case.hold'
on conflict do nothing;

insert into public.edospmis_role_permissions (role_id, permission_id)
select r.id, p.id
from public.edospmis_roles r
cross join public.edospmis_permissions p
where r.name = 'Tenant Administrator'
on conflict do nothing;
