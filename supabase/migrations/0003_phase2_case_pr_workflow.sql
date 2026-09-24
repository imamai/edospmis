-- EDOSPMIS Phase 2 — Case + PR + Workflow + Queue + Approval + SLA (MVP).
--
-- Scope cuts made explicit here, matching the honesty discipline of prior
-- migrations (never claim built what wasn't):
--   - PR items are stored as a jsonb array on edospmis_prs, not a normalized
--     edospmis_pr_items table as ARCHITECTURE.md §1.2 originally sketched.
--     Revisit once line items need independent querying (e.g. Phase 6
--     spend-by-category analytics) — not needed to prove the workflow loop.
--   - The workflow "engine" executes one fixed validation→approval→approved
--     sequence procedurally (inside edospmis_submit_pr /
--     edospmis_decide_approval below), not the fully generic tenant-defined
--     stage graph ARCHITECTURE.md §4.2 describes. The jsonb definition is
--     still stored and versioned so the Case detail chevron reads real
--     stage metadata, not hard-coded labels — but the *transition logic*
--     is TypeScript-adjacent SQL, not a generic interpreter. Worth
--     generalizing once a second tenant needs a genuinely different stage
--     shape, not before.
--   - Approval routing is role-based at tenant scope only (any user holding
--     the matched role can act), not department-scoped — every role granted
--     in Phase 1 is scope_type='tenant' today, so this matches what
--     actually exists rather than half-building department routing nothing
--     populates yet.
--   - No SLA calendar (working hours/holidays) — elapsed time is plain
--     wall-clock. Calendar-aware SLA math is real, separate work
--     (ARCHITECTURE.md §4.4) deferred until a tenant's actual working hours
--     matter enough to justify it.
--   - No escalation ticker (auto-reassignment on breach) — SLA status is
--     computed live from sla_due_at on read, which is enough to satisfy
--     "the Case detail page shows SLA status plainly" without a scheduled
--     job. Escalation policies are a near-term follow-up.
--   - Client Portal (external client login) is NOT part of this pass —
--     edospmis_clients is a staff-managed reference list for now. Giving a
--     client their own authenticated access is comparable in size to the
--     contract-signing token work already designed in §4.6 and deserves the
--     same dedicated pass, not a rushed add-on here.

-- ── Reference data ───────────────────────────────────────────────────────

create table public.edospmis_categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.edospmis_tenants (id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create table public.edospmis_clients (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.edospmis_tenants (id) on delete cascade,
  name text not null,
  email text,
  phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ── Workflow definitions ─────────────────────────────────────────────────

create table public.edospmis_workflows (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.edospmis_tenants (id) on delete cascade,
  name text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.edospmis_workflow_versions (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.edospmis_workflows (id) on delete cascade,
  version_number int not null,
  definition jsonb not null,
  created_at timestamptz not null default now(),
  unique (workflow_id, version_number)
);

-- ── Approval rules (tenant-configurable, amount-tiered) ─────────────────

create table public.edospmis_approval_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.edospmis_tenants (id) on delete cascade,
  name text not null,
  min_amount_cents bigint,
  max_amount_cents bigint,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.edospmis_approval_steps (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.edospmis_approval_rules (id) on delete cascade,
  step_order int not null,
  role_id uuid not null references public.edospmis_roles (id) on delete cascade,
  unique (rule_id, step_order)
);

-- ── SLA policies (per workflow stage) ────────────────────────────────────

create table public.edospmis_sla_policies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.edospmis_tenants (id) on delete cascade,
  stage_key text not null,
  target_minutes int not null,
  warning_minutes int not null,
  breach_minutes int not null,
  unique (tenant_id, stage_key)
);

-- ── Queues ────────────────────────────────────────────────────────────

create table public.edospmis_queues (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.edospmis_tenants (id) on delete cascade,
  name text not null,
  stage_key text not null,
  assignment_strategy text not null default 'role',
  created_at timestamptz not null default now(),
  unique (tenant_id, stage_key)
);

-- ── Cases ─────────────────────────────────────────────────────────────

create table public.edospmis_cases (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.edospmis_tenants (id) on delete cascade,
  case_number text not null,
  client_id uuid references public.edospmis_clients (id) on delete set null,
  department_id uuid references public.edospmis_departments (id) on delete set null,
  status text not null default 'draft'
    check (status in ('draft', 'submitted', 'approval', 'approved', 'rejected', 'returned', 'cancelled')),
  current_stage_key text not null default 'draft',
  workflow_version_id uuid references public.edospmis_workflow_versions (id) on delete set null,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  created_by uuid references public.edospmis_users (id) on delete set null,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  unique (tenant_id, case_number)
);

create table public.edospmis_prs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.edospmis_tenants (id) on delete cascade,
  case_id uuid not null references public.edospmis_cases (id) on delete cascade,
  requester_id uuid not null references public.edospmis_users (id) on delete cascade,
  category_id uuid references public.edospmis_categories (id) on delete set null,
  client_id uuid references public.edospmis_clients (id) on delete set null,
  department_id uuid references public.edospmis_departments (id) on delete set null,
  title text not null,
  justification text,
  items jsonb not null default '[]'::jsonb,
  estimated_cost_cents bigint not null default 0,
  currency text not null default 'KES',
  required_by date,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  status text not null default 'draft'
    check (status in ('draft', 'submitted', 'approved', 'rejected', 'returned', 'cancelled')),
  created_at timestamptz not null default now()
);

-- ── Workflow execution state ─────────────────────────────────────────────

create table public.edospmis_workflow_instances (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.edospmis_tenants (id) on delete cascade,
  case_id uuid not null references public.edospmis_cases (id) on delete cascade,
  workflow_version_id uuid not null references public.edospmis_workflow_versions (id),
  current_stage_key text not null,
  created_at timestamptz not null default now(),
  unique (case_id)
);

create table public.edospmis_workflow_tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.edospmis_tenants (id) on delete cascade,
  instance_id uuid not null references public.edospmis_workflow_instances (id) on delete cascade,
  case_id uuid not null references public.edospmis_cases (id) on delete cascade,
  stage_key text not null,
  task_type text not null default 'human' check (task_type in ('human', 'system')),
  role_id uuid references public.edospmis_roles (id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'completed', 'skipped')),
  due_at timestamptz,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.edospmis_queue_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.edospmis_tenants (id) on delete cascade,
  case_id uuid not null references public.edospmis_cases (id) on delete cascade,
  queue_id uuid not null references public.edospmis_queues (id) on delete cascade,
  status text not null default 'open' check (status in ('open', 'closed')),
  entered_at timestamptz not null default now(),
  left_at timestamptz,
  sla_due_at timestamptz
);

create table public.edospmis_approvals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.edospmis_tenants (id) on delete cascade,
  case_id uuid not null references public.edospmis_cases (id) on delete cascade,
  rule_id uuid not null references public.edospmis_approval_rules (id),
  step_order int not null,
  role_id uuid not null references public.edospmis_roles (id),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'returned')),
  comment text,
  decided_by uuid references public.edospmis_users (id) on delete set null,
  decided_at timestamptz,
  workflow_version_id uuid references public.edospmis_workflow_versions (id),
  created_at timestamptz not null default now()
);

create index edospmis_cases_tenant_status_idx on public.edospmis_cases (tenant_id, status);
create index edospmis_prs_case_idx on public.edospmis_prs (case_id);
create index edospmis_prs_requester_idx on public.edospmis_prs (tenant_id, requester_id);
create index edospmis_queue_entries_open_idx on public.edospmis_queue_entries (tenant_id, queue_id, status);
create index edospmis_approvals_pending_idx on public.edospmis_approvals (tenant_id, role_id, status);
create index edospmis_workflow_tasks_pending_idx on public.edospmis_workflow_tasks (tenant_id, role_id, status);

-- ── New permission: client reference data ────────────────────────────────
-- (procurement.pr.*, admin.workflows.manage, admin.approvals.manage and
-- admin.sla.manage all already exist from migration 0001 — clients are the
-- one new kind of reference data Phase 2 introduces.)

insert into public.edospmis_permissions (key, category, description) values
  ('crm.client.manage', 'crm', 'Create and edit clients');

-- ── RLS ───────────────────────────────────────────────────────────────

alter table public.edospmis_categories enable row level security;
alter table public.edospmis_clients enable row level security;
alter table public.edospmis_workflows enable row level security;
alter table public.edospmis_workflow_versions enable row level security;
alter table public.edospmis_approval_rules enable row level security;
alter table public.edospmis_approval_steps enable row level security;
alter table public.edospmis_sla_policies enable row level security;
alter table public.edospmis_queues enable row level security;
alter table public.edospmis_cases enable row level security;
alter table public.edospmis_prs enable row level security;
alter table public.edospmis_workflow_instances enable row level security;
alter table public.edospmis_workflow_tasks enable row level security;
alter table public.edospmis_queue_entries enable row level security;
alter table public.edospmis_approvals enable row level security;

create policy edospmis_categories_select on public.edospmis_categories
  for select using (public.edospmis_is_member(tenant_id));
create policy edospmis_categories_write on public.edospmis_categories
  for all using (public.edospmis_has_permission(tenant_id, 'admin.org.manage'))
  with check (public.edospmis_has_permission(tenant_id, 'admin.org.manage'));

create policy edospmis_clients_select on public.edospmis_clients
  for select using (public.edospmis_is_member(tenant_id));
create policy edospmis_clients_write on public.edospmis_clients
  for all using (public.edospmis_has_permission(tenant_id, 'crm.client.manage'))
  with check (public.edospmis_has_permission(tenant_id, 'crm.client.manage'));

create policy edospmis_workflows_select on public.edospmis_workflows
  for select using (public.edospmis_is_member(tenant_id));
create policy edospmis_workflows_write on public.edospmis_workflows
  for all using (public.edospmis_has_permission(tenant_id, 'admin.workflows.manage'))
  with check (public.edospmis_has_permission(tenant_id, 'admin.workflows.manage'));

create policy edospmis_workflow_versions_select on public.edospmis_workflow_versions
  for select using (
    exists (select 1 from public.edospmis_workflows w where w.id = workflow_id and public.edospmis_is_member(w.tenant_id))
  );

create policy edospmis_approval_rules_select on public.edospmis_approval_rules
  for select using (public.edospmis_is_member(tenant_id));
create policy edospmis_approval_rules_write on public.edospmis_approval_rules
  for all using (public.edospmis_has_permission(tenant_id, 'admin.approvals.manage'))
  with check (public.edospmis_has_permission(tenant_id, 'admin.approvals.manage'));

create policy edospmis_approval_steps_select on public.edospmis_approval_steps
  for select using (
    exists (select 1 from public.edospmis_approval_rules r where r.id = rule_id and public.edospmis_is_member(r.tenant_id))
  );
create policy edospmis_approval_steps_write on public.edospmis_approval_steps
  for all using (
    exists (select 1 from public.edospmis_approval_rules r where r.id = rule_id and public.edospmis_has_permission(r.tenant_id, 'admin.approvals.manage'))
  )
  with check (
    exists (select 1 from public.edospmis_approval_rules r where r.id = rule_id and public.edospmis_has_permission(r.tenant_id, 'admin.approvals.manage'))
  );

create policy edospmis_sla_policies_select on public.edospmis_sla_policies
  for select using (public.edospmis_is_member(tenant_id));
create policy edospmis_sla_policies_write on public.edospmis_sla_policies
  for all using (public.edospmis_has_permission(tenant_id, 'admin.sla.manage'))
  with check (public.edospmis_has_permission(tenant_id, 'admin.sla.manage'));

create policy edospmis_queues_select on public.edospmis_queues
  for select using (public.edospmis_is_member(tenant_id));
create policy edospmis_queues_write on public.edospmis_queues
  for all using (public.edospmis_has_permission(tenant_id, 'admin.workflows.manage'))
  with check (public.edospmis_has_permission(tenant_id, 'admin.workflows.manage'));

create policy edospmis_cases_select on public.edospmis_cases
  for select using (public.edospmis_is_member(tenant_id));
create policy edospmis_cases_insert on public.edospmis_cases
  for insert with check (public.edospmis_has_permission(tenant_id, 'procurement.pr.create'));
-- No update/delete policy: every state change after creation goes through
-- edospmis_submit_pr / edospmis_decide_approval (both security definer,
-- both check permissions themselves) so a case's lifecycle can't be
-- hand-edited around the workflow engine.

create policy edospmis_prs_select on public.edospmis_prs
  for select using (public.edospmis_is_member(tenant_id));
create policy edospmis_prs_insert on public.edospmis_prs
  for insert with check (public.edospmis_has_permission(tenant_id, 'procurement.pr.create'));
create policy edospmis_prs_update on public.edospmis_prs
  for update using (
    (requester_id = auth.uid() and status = 'draft') or public.edospmis_has_permission(tenant_id, 'procurement.pr.edit')
  )
  with check (
    (requester_id = auth.uid() and status = 'draft') or public.edospmis_has_permission(tenant_id, 'procurement.pr.edit')
  );

create policy edospmis_workflow_instances_select on public.edospmis_workflow_instances
  for select using (public.edospmis_is_member(tenant_id));
create policy edospmis_workflow_tasks_select on public.edospmis_workflow_tasks
  for select using (public.edospmis_is_member(tenant_id));
create policy edospmis_queue_entries_select on public.edospmis_queue_entries
  for select using (public.edospmis_is_member(tenant_id));
create policy edospmis_approvals_select on public.edospmis_approvals
  for select using (public.edospmis_is_member(tenant_id));
-- No write policies on any of the four execution-state tables above — they
-- are only ever written by edospmis_submit_pr / edospmis_decide_approval,
-- which are security definer and bypass RLS entirely, by design.

-- ── Helper: SLA due timestamp for a stage ────────────────────────────────

create or replace function public.edospmis_sla_due_at(p_tenant_id uuid, p_stage_key text)
returns timestamptz
language sql
stable
security definer
set search_path = public, auth
as $$
  select now() + make_interval(mins => target_minutes)
  from public.edospmis_sla_policies
  where tenant_id = p_tenant_id and stage_key = p_stage_key
  limit 1;
$$;

-- ── Case numbering ────────────────────────────────────────────────────

create or replace function public.edospmis_next_case_number(p_tenant_id uuid)
returns text
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_seq bigint;
  v_format text;
  v_number text;
begin
  if not public.edospmis_is_member(p_tenant_id) then
    raise exception 'Not authorized.';
  end if;

  update public.edospmis_tenants
  set case_sequence = case_sequence + 1
  where id = p_tenant_id
  returning case_sequence, numbering_format into v_seq, v_format;

  v_number := replace(v_format, '{year}', extract(year from now())::text);
  v_number := replace(v_number, '{seq}', lpad(v_seq::text, 6, '0'));
  return v_number;
end;
$$;

-- ── Submit a PR: resolves the approval chain and opens the first task ────

create or replace function public.edospmis_submit_pr(p_pr_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_pr record;
  v_workflow_version_id uuid;
  v_rule_id uuid;
  v_first_role_id uuid;
  v_queue_id uuid;
  v_instance_id uuid;
begin
  select * into v_pr from public.edospmis_prs where id = p_pr_id;
  if v_pr is null then
    raise exception 'That request could not be found.';
  end if;
  if not public.edospmis_is_member(v_pr.tenant_id) then
    raise exception 'Not authorized.';
  end if;
  if v_pr.requester_id <> auth.uid() and not public.edospmis_has_permission(v_pr.tenant_id, 'procurement.pr.edit') then
    raise exception 'Only the requester, or someone who can edit requests, can submit this.';
  end if;
  if not public.edospmis_has_permission(v_pr.tenant_id, 'procurement.pr.submit') then
    raise exception 'You do not have permission to submit requests.';
  end if;
  if v_pr.status <> 'draft' then
    raise exception 'This request has already been submitted.';
  end if;
  if jsonb_array_length(v_pr.items) = 0 then
    raise exception 'Add at least one item before submitting.';
  end if;

  select wv.id into v_workflow_version_id
  from public.edospmis_workflow_versions wv
  join public.edospmis_workflows w on w.id = wv.workflow_id
  where w.tenant_id = v_pr.tenant_id and w.is_default
  order by wv.version_number desc
  limit 1;
  if v_workflow_version_id is null then
    raise exception 'This workspace has no default workflow configured.';
  end if;

  select id into v_rule_id
  from public.edospmis_approval_rules
  where tenant_id = v_pr.tenant_id and is_active
    and (min_amount_cents is null or v_pr.estimated_cost_cents >= min_amount_cents)
    and (max_amount_cents is null or v_pr.estimated_cost_cents <= max_amount_cents)
  order by (min_amount_cents is not null) desc, (max_amount_cents is not null) desc,
           coalesce(min_amount_cents, 0) desc
  limit 1;
  if v_rule_id is null then
    raise exception 'No approval rule matches this request''s amount — ask an administrator to configure one.';
  end if;

  select role_id into v_first_role_id
  from public.edospmis_approval_steps
  where rule_id = v_rule_id
  order by step_order asc
  limit 1;
  if v_first_role_id is null then
    raise exception 'The matched approval rule has no steps configured.';
  end if;

  update public.edospmis_prs set status = 'submitted' where id = p_pr_id;

  update public.edospmis_cases
  set status = 'approval', current_stage_key = 'approval', workflow_version_id = v_workflow_version_id
  where id = v_pr.case_id;

  insert into public.edospmis_workflow_instances (tenant_id, case_id, workflow_version_id, current_stage_key)
  values (v_pr.tenant_id, v_pr.case_id, v_workflow_version_id, 'approval')
  on conflict (case_id) do update set current_stage_key = 'approval', workflow_version_id = excluded.workflow_version_id
  returning id into v_instance_id;

  insert into public.edospmis_workflow_tasks (tenant_id, instance_id, case_id, stage_key, task_type, role_id, due_at)
  values (v_pr.tenant_id, v_instance_id, v_pr.case_id, 'approval', 'human', v_first_role_id,
          public.edospmis_sla_due_at(v_pr.tenant_id, 'approval'));

  select id into v_queue_id from public.edospmis_queues where tenant_id = v_pr.tenant_id and stage_key = 'approval';
  if v_queue_id is not null then
    insert into public.edospmis_queue_entries (tenant_id, case_id, queue_id, sla_due_at)
    values (v_pr.tenant_id, v_pr.case_id, v_queue_id, public.edospmis_sla_due_at(v_pr.tenant_id, 'approval'));
  end if;

  insert into public.edospmis_approvals (tenant_id, case_id, rule_id, step_order, role_id, workflow_version_id)
  values (v_pr.tenant_id, v_pr.case_id, v_rule_id, 1, v_first_role_id, v_workflow_version_id);

  insert into public.edospmis_audit_logs (tenant_id, actor_id, action, entity_type, entity_id, after)
  values (v_pr.tenant_id, auth.uid(), 'pr.submitted', 'pr', p_pr_id, jsonb_build_object('case_id', v_pr.case_id));
end;
$$;

-- ── Decide an approval: advances the chain, or resolves the case ────────

create or replace function public.edospmis_decide_approval(p_approval_id uuid, p_decision text, p_comment text)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_approval record;
  v_instance_id uuid;
  v_next_role_id uuid;
  v_next_step int;
  v_permission_key text;
  v_case_status text;
begin
  if p_decision not in ('approved', 'rejected', 'returned') then
    raise exception 'Invalid decision.';
  end if;

  select * into v_approval from public.edospmis_approvals where id = p_approval_id for update;
  if v_approval is null then
    raise exception 'That approval could not be found.';
  end if;
  if v_approval.status <> 'pending' then
    raise exception 'This has already been decided.';
  end if;

  v_permission_key := case p_decision
    when 'approved' then 'procurement.pr.approve'
    when 'rejected' then 'procurement.pr.reject'
    else 'procurement.pr.return'
  end;
  if not public.edospmis_has_permission(v_approval.tenant_id, v_permission_key) then
    raise exception 'You do not have permission to do that.';
  end if;
  if not exists (
    select 1 from public.edospmis_user_roles
    where tenant_id = v_approval.tenant_id and user_id = auth.uid()
      and role_id = v_approval.role_id and scope_type = 'tenant'
  ) then
    raise exception 'This request is waiting on a different role than yours.';
  end if;

  update public.edospmis_approvals
  set status = p_decision, comment = p_comment, decided_by = auth.uid(), decided_at = now()
  where id = p_approval_id;

  select id into v_instance_id from public.edospmis_workflow_instances where case_id = v_approval.case_id;

  update public.edospmis_workflow_tasks
  set status = 'completed', completed_at = now()
  where instance_id = v_instance_id and stage_key = 'approval' and status = 'pending';

  update public.edospmis_queue_entries
  set status = 'closed', left_at = now()
  where case_id = v_approval.case_id and status = 'open'
    and queue_id in (select id from public.edospmis_queues where tenant_id = v_approval.tenant_id and stage_key = 'approval');

  if p_decision = 'rejected' then
    v_case_status := 'rejected';
  elsif p_decision = 'returned' then
    v_case_status := 'returned';
    update public.edospmis_prs set status = 'draft' where case_id = v_approval.case_id;
  else
    select role_id, step_order into v_next_role_id, v_next_step
    from public.edospmis_approval_steps
    where rule_id = v_approval.rule_id and step_order > v_approval.step_order
    order by step_order asc
    limit 1;

    if v_next_role_id is not null then
      insert into public.edospmis_approvals (tenant_id, case_id, rule_id, step_order, role_id, workflow_version_id)
      values (v_approval.tenant_id, v_approval.case_id, v_approval.rule_id, v_next_step, v_next_role_id, v_approval.workflow_version_id);

      insert into public.edospmis_workflow_tasks (tenant_id, instance_id, case_id, stage_key, task_type, role_id, due_at)
      values (v_approval.tenant_id, v_instance_id, v_approval.case_id, 'approval', 'human', v_next_role_id,
              public.edospmis_sla_due_at(v_approval.tenant_id, 'approval'));

      insert into public.edospmis_queue_entries (tenant_id, case_id, queue_id, sla_due_at)
      select v_approval.tenant_id, v_approval.case_id, q.id, public.edospmis_sla_due_at(v_approval.tenant_id, 'approval')
      from public.edospmis_queues q
      where q.tenant_id = v_approval.tenant_id and q.stage_key = 'approval';

      v_case_status := null; -- still mid-approval, case status unchanged
    else
      v_case_status := 'approved';
      update public.edospmis_workflow_instances set current_stage_key = 'approved' where id = v_instance_id;
      update public.edospmis_prs set status = 'approved' where case_id = v_approval.case_id;
    end if;
  end if;

  if v_case_status is not null then
    update public.edospmis_cases
    set status = v_case_status,
        current_stage_key = v_case_status,
        closed_at = case when v_case_status = 'rejected' then now() else closed_at end
    where id = v_approval.case_id;
  end if;

  insert into public.edospmis_audit_logs (tenant_id, actor_id, action, entity_type, entity_id, reason, after)
  values (v_approval.tenant_id, auth.uid(), 'approval.' || p_decision, 'approval', p_approval_id, p_comment,
          jsonb_build_object('case_id', v_approval.case_id));
end;
$$;

-- ── Extend tenant provisioning: default workflow, queues, SLA, approval
--    rule and categories for every new tenant from now on ─────────────────

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
                'crm.client.manage');

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

  update public.edospmis_users set last_tenant_id = v_tenant_id where id = auth.uid();

  -- Default categories
  insert into public.edospmis_categories (tenant_id, name) values
    (v_tenant_id, 'Goods'), (v_tenant_id, 'Services'), (v_tenant_id, 'Works');

  -- Default workflow: draft -> submitted -> approval -> approved. Anything
  -- past "approved" (procurement, fulfilment) is later phases' work.
  insert into public.edospmis_workflows (tenant_id, name, is_default)
  values (v_tenant_id, 'Standard Procurement', true)
  returning id into v_workflow_id;

  insert into public.edospmis_workflow_versions (workflow_id, version_number, definition)
  values (v_workflow_id, 1, jsonb_build_object(
    'stages', jsonb_build_array(
      jsonb_build_object('key', 'draft', 'label', 'Draft'),
      jsonb_build_object('key', 'approval', 'label', 'Approval'),
      jsonb_build_object('key', 'approved', 'label', 'Approved')
    )
  ))
  returning id into v_workflow_version_id;

  -- Default SLA for the approval stage: 18h warning, 24h target/breach —
  -- the exact numbers from the PRD's own escalation example (§13/§14).
  insert into public.edospmis_sla_policies (tenant_id, stage_key, target_minutes, warning_minutes, breach_minutes)
  values (v_tenant_id, 'approval', 1440, 1080, 1440);

  insert into public.edospmis_queues (tenant_id, name, stage_key)
  values (v_tenant_id, 'Approval', 'approval');

  -- Default approval rule: every amount, one step, Department Manager.
  -- A Tenant Administrator can add tiered rules for higher amounts from
  -- the Approval Rules screen — this is the seeded starting point, not
  -- the only rule the tenant will ever have.
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
