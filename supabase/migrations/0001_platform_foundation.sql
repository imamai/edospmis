-- EDOSPMIS Phase 1 — platform foundation.
--
-- Tenant/org structure, users, RBAC (permission catalogue + tenant-scoped
-- roles + scoped role assignments), memberships, and the audit log. See
-- ARCHITECTURE.md §1–§3 for the full design rationale. Case/PR/workflow/
-- procurement/finance tables land in later phase migrations — this file is
-- Phase 1 only.
--
-- Deviation from ARCHITECTURE.md §1.2 worth flagging: that doc describes
-- edospmis_roles.tenant_id as nullable ("null = platform default"). Here
-- every role row is tenant-scoped (tenant_id not null); a fixed in-code
-- template is copied into each new tenant by edospmis_provision_tenant()
-- instead. This avoids nullable-tenant_id special-casing in every RLS
-- policy on edospmis_roles/edospmis_role_permissions for no real benefit —
-- tenants are expected to immediately customize their copies anyway.

-- ── Org structure ────────────────────────────────────────────────────────

create table public.edospmis_tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  status text not null default 'active' check (status in ('trial', 'active', 'suspended')),
  plan text not null default 'trial',
  branding jsonb not null default '{}'::jsonb,
  numbering_format text not null default 'CASE-{year}-{seq}',
  case_sequence bigint not null default 0,
  created_at timestamptz not null default now()
);

create table public.edospmis_users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  phone text,
  last_tenant_id uuid references public.edospmis_tenants (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.edospmis_business_units (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.edospmis_tenants (id) on delete cascade,
  name text not null,
  code text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create table public.edospmis_branches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.edospmis_tenants (id) on delete cascade,
  business_unit_id uuid references public.edospmis_business_units (id) on delete set null,
  name text not null,
  code text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create table public.edospmis_departments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.edospmis_tenants (id) on delete cascade,
  branch_id uuid references public.edospmis_branches (id) on delete set null,
  business_unit_id uuid references public.edospmis_business_units (id) on delete set null,
  name text not null,
  code text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create table public.edospmis_teams (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.edospmis_tenants (id) on delete cascade,
  department_id uuid references public.edospmis_departments (id) on delete set null,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, name)
);

-- ── Membership (a user belongs to a tenant) ─────────────────────────────

create table public.edospmis_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.edospmis_users (id) on delete cascade,
  tenant_id uuid not null references public.edospmis_tenants (id) on delete cascade,
  status text not null default 'invited' check (status in ('invited', 'active', 'suspended')),
  invited_by uuid references public.edospmis_users (id) on delete set null,
  department_id uuid references public.edospmis_departments (id) on delete set null,
  branch_id uuid references public.edospmis_branches (id) on delete set null,
  last_active_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, tenant_id)
);

-- ── RBAC: fixed permission catalogue + tenant-scoped roles ──────────────

create table public.edospmis_permissions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  category text not null,
  description text not null
);

create table public.edospmis_roles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.edospmis_tenants (id) on delete cascade,
  name text not null,
  description text,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create table public.edospmis_role_permissions (
  role_id uuid not null references public.edospmis_roles (id) on delete cascade,
  permission_id uuid not null references public.edospmis_permissions (id) on delete cascade,
  primary key (role_id, permission_id)
);

create table public.edospmis_user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.edospmis_users (id) on delete cascade,
  tenant_id uuid not null references public.edospmis_tenants (id) on delete cascade,
  role_id uuid not null references public.edospmis_roles (id) on delete cascade,
  scope_type text not null default 'tenant' check (scope_type in ('tenant', 'business_unit', 'branch', 'department')),
  scope_id uuid,
  created_at timestamptz not null default now(),
  unique (user_id, role_id, scope_type, scope_id)
);

-- ── Audit ─────────────────────────────────────────────────────────────

create table public.edospmis_audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.edospmis_tenants (id) on delete cascade,
  actor_id uuid references public.edospmis_users (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before jsonb,
  after jsonb,
  reason text,
  created_at timestamptz not null default now()
);

create index edospmis_audit_logs_tenant_idx on public.edospmis_audit_logs (tenant_id, created_at desc);
create index edospmis_memberships_tenant_idx on public.edospmis_memberships (tenant_id, status);
create index edospmis_user_roles_lookup_idx on public.edospmis_user_roles (user_id, tenant_id);

-- ── Permission catalogue seed (platform-fixed; PRD §8 vocabulary) ───────

insert into public.edospmis_permissions (key, category, description) values
  ('procurement.pr.create', 'procurement', 'Create a purchase requisition'),
  ('procurement.pr.view', 'procurement', 'View purchase requisitions'),
  ('procurement.pr.edit', 'procurement', 'Edit a purchase requisition'),
  ('procurement.pr.submit', 'procurement', 'Submit a PR for approval'),
  ('procurement.pr.approve', 'procurement', 'Approve a PR'),
  ('procurement.pr.reject', 'procurement', 'Reject a PR'),
  ('procurement.pr.return', 'procurement', 'Return a PR for correction'),
  ('procurement.pr.cancel', 'procurement', 'Cancel a PR'),
  ('procurement.rfq.create', 'procurement', 'Create an RFQ'),
  ('procurement.rfq.view', 'procurement', 'View RFQs'),
  ('procurement.rfq.send', 'procurement', 'Send an RFQ to suppliers'),
  ('procurement.rfq.evaluate', 'procurement', 'Evaluate supplier quotations'),
  ('procurement.po.create', 'procurement', 'Create a purchase order'),
  ('procurement.po.view', 'procurement', 'View purchase orders'),
  ('procurement.po.approve', 'procurement', 'Approve a purchase order'),
  ('procurement.po.issue', 'procurement', 'Issue a purchase order to a supplier'),
  ('procurement.po.cancel', 'procurement', 'Cancel a purchase order'),
  ('receiving.grn.create', 'receiving', 'Record goods received'),
  ('receiving.grn.view', 'receiving', 'View goods-received notes'),
  ('receiving.grn.approve', 'receiving', 'Approve a goods-received note'),
  ('finance.invoice.view', 'finance', 'View invoices'),
  ('finance.invoice.approve', 'finance', 'Approve an invoice'),
  ('finance.payment.approve', 'finance', 'Approve a payment'),
  ('delivery.assign', 'delivery', 'Assign a delivery/service task'),
  ('delivery.dispatch', 'delivery', 'Dispatch a delivery'),
  ('delivery.complete', 'delivery', 'Mark a delivery/service complete'),
  ('reports.view', 'reports', 'View reports and dashboards'),
  ('reports.export', 'reports', 'Export report data'),
  ('admin.users.manage', 'admin', 'Invite, edit and deactivate users'),
  ('admin.roles.manage', 'admin', 'Create and edit roles and permission grants'),
  ('admin.permissions.manage', 'admin', 'Reserved — permission catalogue is platform-fixed'),
  ('admin.workflows.manage', 'admin', 'Configure workflows'),
  ('admin.approvals.manage', 'admin', 'Configure approval rules'),
  ('admin.sla.manage', 'admin', 'Configure SLA and escalation policies'),
  ('admin.org.manage', 'admin', 'Configure business units, branches, departments and teams'),
  ('admin.audit.view', 'admin', 'View the audit log');

-- ── RLS helper functions ─────────────────────────────────────────────────

create or replace function public.edospmis_is_member(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1 from public.edospmis_memberships m
    where m.tenant_id = p_tenant_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

create or replace function public.edospmis_has_permission(p_tenant_id uuid, p_permission_key text)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.edospmis_user_roles ur
    join public.edospmis_role_permissions rp on rp.role_id = ur.role_id
    join public.edospmis_permissions p on p.id = rp.permission_id
    join public.edospmis_memberships m on m.user_id = ur.user_id and m.tenant_id = ur.tenant_id
    where ur.tenant_id = p_tenant_id
      and ur.user_id = auth.uid()
      and ur.scope_type = 'tenant'
      and m.status = 'active'
      and p.key = p_permission_key
  );
$$;

create or replace function public.edospmis_shares_tenant(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.edospmis_memberships mine
    join public.edospmis_memberships theirs
      on theirs.tenant_id = mine.tenant_id and theirs.user_id = p_user_id
    where mine.user_id = auth.uid()
      and mine.status = 'active'
      and theirs.status in ('active', 'invited')
  );
$$;

-- Heals a profile row a client-side signUp() cannot write directly (RLS
-- blocks inserting into edospmis_users pre-membership) — called defensively
-- from getSession() on every request, same pattern proven in edoshatch360.
create or replace function public.edospmis_ensure_profile()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  insert into public.edospmis_users (id, email, full_name, phone)
  select u.id, u.email,
         coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name'),
         coalesce(u.raw_user_meta_data ->> 'phone', u.phone)
  from auth.users u
  where u.id = auth.uid()
  on conflict (id) do nothing;

  update public.edospmis_memberships
  set status = 'active'
  where user_id = auth.uid() and status = 'invited';
end;
$$;

-- ── RLS ───────────────────────────────────────────────────────────────

alter table public.edospmis_tenants enable row level security;
alter table public.edospmis_users enable row level security;
alter table public.edospmis_business_units enable row level security;
alter table public.edospmis_branches enable row level security;
alter table public.edospmis_departments enable row level security;
alter table public.edospmis_teams enable row level security;
alter table public.edospmis_memberships enable row level security;
alter table public.edospmis_permissions enable row level security;
alter table public.edospmis_roles enable row level security;
alter table public.edospmis_role_permissions enable row level security;
alter table public.edospmis_user_roles enable row level security;
alter table public.edospmis_audit_logs enable row level security;

create policy edospmis_tenants_select on public.edospmis_tenants
  for select using (public.edospmis_is_member(id));
-- Tenants are only ever inserted via edospmis_provision_tenant() (security
-- definer, below) — no direct insert/update/delete policy for any role.

create policy edospmis_users_select on public.edospmis_users
  for select using (id = auth.uid() or public.edospmis_shares_tenant(id));
create policy edospmis_users_update_self on public.edospmis_users
  for update using (id = auth.uid());

create policy edospmis_business_units_select on public.edospmis_business_units
  for select using (public.edospmis_is_member(tenant_id));
create policy edospmis_business_units_write on public.edospmis_business_units
  for all using (public.edospmis_has_permission(tenant_id, 'admin.org.manage'))
  with check (public.edospmis_has_permission(tenant_id, 'admin.org.manage'));

create policy edospmis_branches_select on public.edospmis_branches
  for select using (public.edospmis_is_member(tenant_id));
create policy edospmis_branches_write on public.edospmis_branches
  for all using (public.edospmis_has_permission(tenant_id, 'admin.org.manage'))
  with check (public.edospmis_has_permission(tenant_id, 'admin.org.manage'));

create policy edospmis_departments_select on public.edospmis_departments
  for select using (public.edospmis_is_member(tenant_id));
create policy edospmis_departments_write on public.edospmis_departments
  for all using (public.edospmis_has_permission(tenant_id, 'admin.org.manage'))
  with check (public.edospmis_has_permission(tenant_id, 'admin.org.manage'));

create policy edospmis_teams_select on public.edospmis_teams
  for select using (public.edospmis_is_member(tenant_id));
create policy edospmis_teams_write on public.edospmis_teams
  for all using (public.edospmis_has_permission(tenant_id, 'admin.org.manage'))
  with check (public.edospmis_has_permission(tenant_id, 'admin.org.manage'));

create policy edospmis_memberships_select on public.edospmis_memberships
  for select using (public.edospmis_is_member(tenant_id) or user_id = auth.uid());
create policy edospmis_memberships_write on public.edospmis_memberships
  for all using (public.edospmis_has_permission(tenant_id, 'admin.users.manage'))
  with check (public.edospmis_has_permission(tenant_id, 'admin.users.manage'));

create policy edospmis_permissions_select on public.edospmis_permissions
  for select using (auth.uid() is not null);

create policy edospmis_roles_select on public.edospmis_roles
  for select using (public.edospmis_is_member(tenant_id));
create policy edospmis_roles_write on public.edospmis_roles
  for all using (public.edospmis_has_permission(tenant_id, 'admin.roles.manage') and not is_system)
  with check (public.edospmis_has_permission(tenant_id, 'admin.roles.manage') and not is_system);

create policy edospmis_role_permissions_select on public.edospmis_role_permissions
  for select using (
    exists (select 1 from public.edospmis_roles r where r.id = role_id and public.edospmis_is_member(r.tenant_id))
  );
create policy edospmis_role_permissions_write on public.edospmis_role_permissions
  for all using (
    exists (
      select 1 from public.edospmis_roles r
      where r.id = role_id and public.edospmis_has_permission(r.tenant_id, 'admin.roles.manage')
    )
  )
  with check (
    exists (
      select 1 from public.edospmis_roles r
      where r.id = role_id and public.edospmis_has_permission(r.tenant_id, 'admin.roles.manage')
    )
  );

create policy edospmis_user_roles_select on public.edospmis_user_roles
  for select using (public.edospmis_is_member(tenant_id) or user_id = auth.uid());
create policy edospmis_user_roles_write on public.edospmis_user_roles
  for all using (public.edospmis_has_permission(tenant_id, 'admin.users.manage'))
  with check (public.edospmis_has_permission(tenant_id, 'admin.users.manage'));

create policy edospmis_audit_logs_select on public.edospmis_audit_logs
  for select using (public.edospmis_has_permission(tenant_id, 'admin.audit.view'));
-- No update/delete policy anywhere for audit logs — append-only by omission;
-- inserts happen exclusively through server-side code using the signed-in
-- user's own membership, so an insert policy keyed on plain membership is
-- enough (the app decides what's worth logging, not RLS).
create policy edospmis_audit_logs_insert on public.edospmis_audit_logs
  for insert with check (public.edospmis_is_member(tenant_id));

-- ── Tenant provisioning ──────────────────────────────────────────────────
--
-- Runs the whole "new organization signs up" sequence in one transaction:
-- tenant row, membership, a starter set of tenant-scoped roles copied from
-- a fixed in-code template (see ARCHITECTURE.md §1.2 deviation note above),
-- the Tenant Administrator assignment, and the audit entry. Security
-- definer so it can run immediately after auth.signUp(), before the caller
-- has any membership-based grant of their own yet.

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
  where key like 'procurement.%' or key in ('reports.view', 'reports.export');

  insert into public.edospmis_roles (tenant_id, name, description, is_system) values
    (v_tenant_id, 'Procurement Officer', 'Runs RFQs and builds purchase orders.', true) returning id into v_role_proc_officer;
  insert into public.edospmis_role_permissions (role_id, permission_id)
  select v_role_proc_officer, id from public.edospmis_permissions
  where key in ('procurement.pr.view', 'procurement.rfq.create', 'procurement.rfq.view',
                'procurement.rfq.send', 'procurement.rfq.evaluate', 'procurement.po.create', 'procurement.po.view');

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
  where key in ('procurement.pr.create', 'procurement.pr.view');

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

  insert into public.edospmis_user_roles (user_id, tenant_id, role_id, scope_type)
  values (auth.uid(), v_tenant_id, v_role_admin, 'tenant');

  update public.edospmis_users set last_tenant_id = v_tenant_id where id = auth.uid();

  insert into public.edospmis_audit_logs (tenant_id, actor_id, action, entity_type, entity_id, after)
  values (v_tenant_id, auth.uid(), 'tenant.provisioned', 'tenant', v_tenant_id,
          jsonb_build_object('name', p_tenant_name, 'slug', p_tenant_slug));

  return v_tenant_id;
end;
$$;
