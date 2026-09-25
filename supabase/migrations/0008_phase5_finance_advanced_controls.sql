-- EDOSPMIS Phase 5 — Finance (Invoice + Three-Way Match) + Advanced
-- Controls (Segregation of Duties, Delegation).
--
-- Scope cuts, same honesty discipline as every prior migration:
--   - One invoice per PO (`unique (po_id)` on edospmis_invoices) — partial/
--     multi-invoice billing against a single PO is real follow-up work, not
--     needed to prove PO -> GRN -> Invoice -> match -> pay travels end to
--     end. Same cut shape as "one delivery per case" in Phase 4.
--   - Three-way match compares invoice total to PO total exactly (no
--     tolerance percentage yet) and total invoiced qty to total received
--     qty across all the case's GRNs (no per-line-item matching yet, since
--     PO/invoice items are still jsonb, not normalized rows — the same
--     items-as-jsonb simplification every prior phase already made).
--   - No payment integration/export — "paid" is a manually-recorded status
--     + reference (FR-31 explicitly scopes this as "integration-ready
--     export toward an external accounting/ERP system", not native ledger
--     functionality or a real payment gateway).
--   - Segregation of duties ships with exactly the two rules the PRD's own
--     risk register names as examples (PR requester ≠ approver, GRN
--     receiver ≠ payment approver) — both tenant-toggleable and OFF by
--     default, exactly as PRD §11's risk mitigation specifies ("opt-in per
--     tenant, off by default for small tenants"). The full tenant-defined
--     conflict-rule builder ARCHITECTURE.md/PRD FR-13 gestures at is a
--     real, separate follow-up once a tenant needs a rule beyond these two.
--   - Delegation is role-scoped and tenant-wide (matches how roles
--     themselves work today, see Phase 2's migration header) — no
--     department/branch-scoped delegation yet, and no auto-escalation on
--     an expired delegation (FR-12 is separate, later work).

-- ── Finance: Invoice + three-way match ───────────────────────────────────

create table public.edospmis_invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.edospmis_tenants (id) on delete cascade,
  case_id uuid not null references public.edospmis_cases (id) on delete cascade,
  po_id uuid not null references public.edospmis_purchase_orders (id) on delete cascade,
  supplier_id uuid not null references public.edospmis_suppliers (id),
  invoice_number text not null,
  items jsonb not null default '[]'::jsonb,
  subtotal_cents bigint not null default 0,
  tax_cents bigint not null default 0,
  total_cents bigint not null default 0,
  currency text not null default 'KES',
  payment_terms text,
  due_date date,
  status text not null default 'submitted' check (status in ('submitted', 'matched', 'exception', 'approved', 'paid', 'void')),
  submitted_by uuid references public.edospmis_users (id) on delete set null,
  submitted_at timestamptz not null default now(),
  approved_by uuid references public.edospmis_users (id) on delete set null,
  approved_at timestamptz,
  paid_at timestamptz,
  payment_reference text,
  created_at timestamptz not null default now(),
  unique (po_id)
);

create table public.edospmis_match_exceptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.edospmis_tenants (id) on delete cascade,
  invoice_id uuid not null references public.edospmis_invoices (id) on delete cascade,
  po_id uuid not null references public.edospmis_purchase_orders (id),
  grn_id uuid references public.edospmis_grns (id) on delete set null,
  exception_type text not null check (exception_type in ('quantity_mismatch', 'price_mismatch', 'missing_grn')),
  detail text not null,
  status text not null default 'open' check (status in ('open', 'resolved')),
  resolved_by uuid references public.edospmis_users (id) on delete set null,
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz not null default now()
);

create index edospmis_invoices_case_idx on public.edospmis_invoices (case_id);
create index edospmis_match_exceptions_invoice_idx on public.edospmis_match_exceptions (invoice_id);

-- ── Segregation of duties: tenant-toggleable, off by default ─────────────

create table public.edospmis_sod_settings (
  tenant_id uuid primary key references public.edospmis_tenants (id) on delete cascade,
  pr_requester_not_approver boolean not null default false,
  receiver_not_payment_approver boolean not null default false
);

-- ── Delegation: temporary acting-approver ────────────────────────────────

create table public.edospmis_delegations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.edospmis_tenants (id) on delete cascade,
  role_id uuid not null references public.edospmis_roles (id) on delete cascade,
  from_user_id uuid not null references public.edospmis_users (id) on delete cascade,
  to_user_id uuid not null references public.edospmis_users (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_by uuid references public.edospmis_users (id) on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  check (ends_at > starts_at)
);

create index edospmis_delegations_active_idx on public.edospmis_delegations (tenant_id, role_id, to_user_id) where revoked_at is null;

-- ── New permission: submitting an invoice is distinct from approving one

insert into public.edospmis_permissions (key, category, description) values
  ('finance.invoice.create', 'finance', 'Submit a supplier invoice for matching');

-- ── RLS ───────────────────────────────────────────────────────────────

alter table public.edospmis_invoices enable row level security;
alter table public.edospmis_match_exceptions enable row level security;
alter table public.edospmis_sod_settings enable row level security;
alter table public.edospmis_delegations enable row level security;

create policy edospmis_invoices_select on public.edospmis_invoices
  for select using (public.edospmis_is_member(tenant_id));
-- No write policy: only the functions below (security definer) write here.

create policy edospmis_match_exceptions_select on public.edospmis_match_exceptions
  for select using (public.edospmis_is_member(tenant_id));
-- No write policy: only edospmis_submit_invoice / edospmis_resolve_match_exception write here.

create policy edospmis_sod_settings_select on public.edospmis_sod_settings
  for select using (public.edospmis_is_member(tenant_id));
create policy edospmis_sod_settings_write on public.edospmis_sod_settings
  for all using (public.edospmis_has_permission(tenant_id, 'admin.approvals.manage'))
  with check (public.edospmis_has_permission(tenant_id, 'admin.approvals.manage'));

create policy edospmis_delegations_select on public.edospmis_delegations
  for select using (public.edospmis_is_member(tenant_id));
-- No write policy: only edospmis_create_delegation / edospmis_revoke_delegation write here
-- (creating one requires actually holding the role being delegated, which is
-- easier to check once, correctly, inside a function than to re-express in RLS).

-- ── Extend case lifecycle: Finance sits between Receiving and Delivery ───

alter table public.edospmis_cases drop constraint edospmis_cases_status_check;
alter table public.edospmis_cases add constraint edospmis_cases_status_check
  check (status in ('draft', 'submitted', 'approval', 'approved', 'rejected', 'returned', 'cancelled',
                     'procurement', 'awarded', 'receiving', 'finance', 'delivery', 'closed'));

-- ── Submit an invoice and run the three-way match ────────────────────────

create or replace function public.edospmis_submit_invoice(p_case_id uuid, p_invoice_number text, p_items jsonb, p_tax_cents bigint, p_payment_terms text, p_due_date date)
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
            format('Invoice total %s does not match PO total %s.', v_total, v_po.total_cents));
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

-- ── Resolve a match exception; once every exception on an invoice is
--    resolved, the invoice becomes matched and ready for approval ────────

create or replace function public.edospmis_resolve_match_exception(p_exception_id uuid, p_resolution_note text)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_exception record;
  v_remaining int;
begin
  select * into v_exception from public.edospmis_match_exceptions where id = p_exception_id;
  if v_exception is null then
    raise exception 'That exception could not be found.';
  end if;
  if not public.edospmis_has_permission(v_exception.tenant_id, 'finance.invoice.approve') then
    raise exception 'You do not have permission to resolve match exceptions.';
  end if;
  if v_exception.status = 'resolved' then
    raise exception 'This exception has already been resolved.';
  end if;
  if p_resolution_note is null or trim(p_resolution_note) = '' then
    raise exception 'Explain how this was resolved.';
  end if;

  update public.edospmis_match_exceptions
  set status = 'resolved', resolved_by = auth.uid(), resolved_at = now(), resolution_note = p_resolution_note
  where id = p_exception_id;

  select count(*) into v_remaining from public.edospmis_match_exceptions
  where invoice_id = v_exception.invoice_id and status = 'open';
  if v_remaining = 0 then
    update public.edospmis_invoices set status = 'matched' where id = v_exception.invoice_id;
  end if;

  insert into public.edospmis_audit_logs (tenant_id, actor_id, action, entity_type, entity_id, reason)
  values (v_exception.tenant_id, auth.uid(), 'match_exception.resolved', 'match_exception', p_exception_id, p_resolution_note);
end;
$$;

-- ── Approve an invoice for payment (blocked while exceptions are open) ───

create or replace function public.edospmis_approve_invoice(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_invoice record;
  v_sod record;
  v_blocked boolean;
begin
  select * into v_invoice from public.edospmis_invoices where id = p_invoice_id;
  if v_invoice is null then
    raise exception 'That invoice could not be found.';
  end if;
  if not public.edospmis_has_permission(v_invoice.tenant_id, 'finance.invoice.approve') then
    raise exception 'You do not have permission to approve invoices.';
  end if;
  if v_invoice.status <> 'matched' then
    raise exception 'Resolve every open exception before approving this invoice.';
  end if;

  select * into v_sod from public.edospmis_sod_settings where tenant_id = v_invoice.tenant_id;
  if v_sod.receiver_not_payment_approver then
    select exists (
      select 1 from public.edospmis_grns g
      where g.case_id = v_invoice.case_id and g.received_by = auth.uid()
    ) into v_blocked;
    if v_blocked then
      raise exception 'Segregation of duties: whoever received these goods cannot also approve payment for them.';
    end if;
  end if;

  update public.edospmis_invoices set status = 'approved', approved_by = auth.uid(), approved_at = now() where id = p_invoice_id;

  insert into public.edospmis_audit_logs (tenant_id, actor_id, action, entity_type, entity_id, after)
  values (v_invoice.tenant_id, auth.uid(), 'invoice.approved', 'invoice', p_invoice_id, jsonb_build_object('case_id', v_invoice.case_id));
end;
$$;

-- ── Record payment ───────────────────────────────────────────────────────

create or replace function public.edospmis_record_payment(p_invoice_id uuid, p_reference text)
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
  if not public.edospmis_has_permission(v_invoice.tenant_id, 'finance.payment.approve') then
    raise exception 'You do not have permission to record payments.';
  end if;
  if v_invoice.status <> 'approved' then
    raise exception 'This invoice must be approved before payment can be recorded.';
  end if;

  update public.edospmis_invoices set status = 'paid', paid_at = now(), payment_reference = p_reference where id = p_invoice_id;

  insert into public.edospmis_audit_logs (tenant_id, actor_id, action, entity_type, entity_id, after)
  values (v_invoice.tenant_id, auth.uid(), 'invoice.paid', 'invoice', p_invoice_id, jsonb_build_object('case_id', v_invoice.case_id, 'reference', p_reference));
end;
$$;

-- ── Segregation of duties settings: read-modify-write helper for the UI ──

create or replace function public.edospmis_set_sod_settings(p_tenant_id uuid, p_pr_requester_not_approver boolean, p_receiver_not_payment_approver boolean)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.edospmis_has_permission(p_tenant_id, 'admin.approvals.manage') then
    raise exception 'You do not have permission to change these settings.';
  end if;

  insert into public.edospmis_sod_settings (tenant_id, pr_requester_not_approver, receiver_not_payment_approver)
  values (p_tenant_id, p_pr_requester_not_approver, p_receiver_not_payment_approver)
  on conflict (tenant_id) do update
    set pr_requester_not_approver = excluded.pr_requester_not_approver,
        receiver_not_payment_approver = excluded.receiver_not_payment_approver;

  insert into public.edospmis_audit_logs (tenant_id, actor_id, action, entity_type, entity_id, after)
  values (p_tenant_id, auth.uid(), 'sod_settings.updated', 'tenant', p_tenant_id,
          jsonb_build_object('pr_requester_not_approver', p_pr_requester_not_approver, 'receiver_not_payment_approver', p_receiver_not_payment_approver));
end;
$$;

-- ── Delegation: create + revoke ──────────────────────────────────────────

create or replace function public.edospmis_create_delegation(p_role_id uuid, p_to_user_id uuid, p_starts_at timestamptz, p_ends_at timestamptz)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_role record;
  v_delegation_id uuid;
begin
  select * into v_role from public.edospmis_roles where id = p_role_id;
  if v_role is null then
    raise exception 'That role could not be found.';
  end if;
  if not exists (
    select 1 from public.edospmis_user_roles
    where tenant_id = v_role.tenant_id and user_id = auth.uid() and role_id = p_role_id and scope_type = 'tenant'
  ) then
    raise exception 'You can only delegate a role you hold yourself.';
  end if;
  if p_ends_at <= p_starts_at then
    raise exception 'The end date must be after the start date.';
  end if;
  if p_ends_at <= now() then
    raise exception 'The end date must be in the future.';
  end if;
  if p_to_user_id = auth.uid() then
    raise exception 'Choose a different tenant teammate to delegate to.';
  end if;
  if not exists (
    select 1 from public.edospmis_memberships
    where tenant_id = v_role.tenant_id and user_id = p_to_user_id and status = 'active'
  ) then
    raise exception 'That person is not a member of this workspace.';
  end if;

  insert into public.edospmis_delegations (tenant_id, role_id, from_user_id, to_user_id, starts_at, ends_at, created_by)
  values (v_role.tenant_id, p_role_id, auth.uid(), p_to_user_id, p_starts_at, p_ends_at, auth.uid())
  returning id into v_delegation_id;

  insert into public.edospmis_audit_logs (tenant_id, actor_id, action, entity_type, entity_id, after)
  values (v_role.tenant_id, auth.uid(), 'delegation.created', 'delegation', v_delegation_id,
          jsonb_build_object('role_id', p_role_id, 'to_user_id', p_to_user_id, 'starts_at', p_starts_at, 'ends_at', p_ends_at));

  return v_delegation_id;
end;
$$;

create or replace function public.edospmis_revoke_delegation(p_delegation_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_delegation record;
begin
  select * into v_delegation from public.edospmis_delegations where id = p_delegation_id;
  if v_delegation is null then
    raise exception 'That delegation could not be found.';
  end if;
  if v_delegation.from_user_id <> auth.uid() and not public.edospmis_has_permission(v_delegation.tenant_id, 'admin.roles.manage') then
    raise exception 'You do not have permission to revoke this delegation.';
  end if;
  if v_delegation.revoked_at is not null then
    raise exception 'This delegation has already been revoked.';
  end if;

  update public.edospmis_delegations set revoked_at = now() where id = p_delegation_id;

  insert into public.edospmis_audit_logs (tenant_id, actor_id, action, entity_type, entity_id)
  values (v_delegation.tenant_id, auth.uid(), 'delegation.revoked', 'delegation', p_delegation_id);
end;
$$;

-- ── Extend edospmis_decide_approval: honour active delegations, and
--    enforce the PR-requester-not-approver SoD rule when a tenant opts in ──

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
  v_sod record;
  v_requester_id uuid;
  v_holds_role boolean;
  v_authorized boolean;
  v_role_grants_permission boolean;
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

  select exists (
    select 1 from public.edospmis_user_roles
    where tenant_id = v_approval.tenant_id and user_id = auth.uid()
      and role_id = v_approval.role_id and scope_type = 'tenant'
  ) into v_holds_role;

  if v_holds_role then
    v_authorized := public.edospmis_has_permission(v_approval.tenant_id, v_permission_key);
  else
    select exists (
      select 1 from public.edospmis_delegations d
      where d.tenant_id = v_approval.tenant_id and d.role_id = v_approval.role_id and d.to_user_id = auth.uid()
        and d.revoked_at is null and now() between d.starts_at and d.ends_at
    ) into v_authorized;

    if v_authorized then
      -- Acting on delegated authority: the permission comes from the
      -- delegated role itself, not from whatever roles this user directly
      -- holds (which may grant nothing procurement-related at all).
      select exists (
        select 1 from public.edospmis_role_permissions rp
        join public.edospmis_permissions p on p.id = rp.permission_id
        where rp.role_id = v_approval.role_id and p.key = v_permission_key
      ) into v_role_grants_permission;
      v_authorized := v_role_grants_permission;
    end if;
  end if;

  if not v_authorized then
    raise exception 'You do not have permission to do that, or this request is waiting on a different role than yours.';
  end if;

  select * into v_sod from public.edospmis_sod_settings where tenant_id = v_approval.tenant_id;
  if v_sod.pr_requester_not_approver then
    select requester_id into v_requester_id from public.edospmis_prs where case_id = v_approval.case_id;
    if v_requester_id = auth.uid() then
      raise exception 'Segregation of duties: you cannot approve your own request.';
    end if;
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

-- ── Extend tenant provisioning: sod defaults, Finance stage, invoice perm

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

  -- The full chevron ARCHITECTURE.md §10.2 describes, Finance now included.
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

insert into public.edospmis_sod_settings (tenant_id)
select id from public.edospmis_tenants
on conflict (tenant_id) do nothing;

insert into public.edospmis_role_permissions (role_id, permission_id)
select r.id, p.id
from public.edospmis_roles r
cross join public.edospmis_permissions p
where r.name = 'Finance Officer' and p.key = 'finance.invoice.create'
on conflict do nothing;

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
           jsonb_build_object('key', 'finance', 'label', 'Finance'),
           jsonb_build_object('key', 'delivery', 'label', 'Delivery'),
           jsonb_build_object('key', 'closed', 'label', 'Completed')
         )
       )
from public.edospmis_workflows w
where w.is_default;
