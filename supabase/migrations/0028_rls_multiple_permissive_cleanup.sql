-- Phase 10c — Supabase's performance advisor flagged 20 tables where a
-- `_select` policy and a `_write` (FOR ALL) policy are both permissive and
-- both match SELECT, so every read evaluates two policies instead of one.
-- Verified via pg_policies this session that every `_write` policy below has
-- qual byte-identical to with_check, so this is a pure mechanical split into
-- insert/update/delete (no SELECT clause), leaving each table's existing
-- `_select` policy as sole SELECT authority. Zero behavior change.

-- edospmis_approval_rules
drop policy edospmis_approval_rules_write on public.edospmis_approval_rules;
create policy edospmis_approval_rules_insert on public.edospmis_approval_rules
  for insert with check (edospmis_has_permission(tenant_id, 'admin.approvals.manage'));
create policy edospmis_approval_rules_update on public.edospmis_approval_rules
  for update using (edospmis_has_permission(tenant_id, 'admin.approvals.manage'))
  with check (edospmis_has_permission(tenant_id, 'admin.approvals.manage'));
create policy edospmis_approval_rules_delete on public.edospmis_approval_rules
  for delete using (edospmis_has_permission(tenant_id, 'admin.approvals.manage'));

-- edospmis_approval_steps
drop policy edospmis_approval_steps_write on public.edospmis_approval_steps;
create policy edospmis_approval_steps_insert on public.edospmis_approval_steps
  for insert with check (exists (
    select 1 from public.edospmis_approval_rules r
    where r.id = edospmis_approval_steps.rule_id and edospmis_has_permission(r.tenant_id, 'admin.approvals.manage')
  ));
create policy edospmis_approval_steps_update on public.edospmis_approval_steps
  for update using (exists (
    select 1 from public.edospmis_approval_rules r
    where r.id = edospmis_approval_steps.rule_id and edospmis_has_permission(r.tenant_id, 'admin.approvals.manage')
  )) with check (exists (
    select 1 from public.edospmis_approval_rules r
    where r.id = edospmis_approval_steps.rule_id and edospmis_has_permission(r.tenant_id, 'admin.approvals.manage')
  ));
create policy edospmis_approval_steps_delete on public.edospmis_approval_steps
  for delete using (exists (
    select 1 from public.edospmis_approval_rules r
    where r.id = edospmis_approval_steps.rule_id and edospmis_has_permission(r.tenant_id, 'admin.approvals.manage')
  ));

-- edospmis_branches
drop policy edospmis_branches_write on public.edospmis_branches;
create policy edospmis_branches_insert on public.edospmis_branches
  for insert with check (edospmis_has_permission(tenant_id, 'admin.org.manage'));
create policy edospmis_branches_update on public.edospmis_branches
  for update using (edospmis_has_permission(tenant_id, 'admin.org.manage'))
  with check (edospmis_has_permission(tenant_id, 'admin.org.manage'));
create policy edospmis_branches_delete on public.edospmis_branches
  for delete using (edospmis_has_permission(tenant_id, 'admin.org.manage'));

-- edospmis_business_units
drop policy edospmis_business_units_write on public.edospmis_business_units;
create policy edospmis_business_units_insert on public.edospmis_business_units
  for insert with check (edospmis_has_permission(tenant_id, 'admin.org.manage'));
create policy edospmis_business_units_update on public.edospmis_business_units
  for update using (edospmis_has_permission(tenant_id, 'admin.org.manage'))
  with check (edospmis_has_permission(tenant_id, 'admin.org.manage'));
create policy edospmis_business_units_delete on public.edospmis_business_units
  for delete using (edospmis_has_permission(tenant_id, 'admin.org.manage'));

-- edospmis_categories
drop policy edospmis_categories_write on public.edospmis_categories;
create policy edospmis_categories_insert on public.edospmis_categories
  for insert with check (edospmis_has_permission(tenant_id, 'admin.org.manage'));
create policy edospmis_categories_update on public.edospmis_categories
  for update using (edospmis_has_permission(tenant_id, 'admin.org.manage'))
  with check (edospmis_has_permission(tenant_id, 'admin.org.manage'));
create policy edospmis_categories_delete on public.edospmis_categories
  for delete using (edospmis_has_permission(tenant_id, 'admin.org.manage'));

-- edospmis_clients
drop policy edospmis_clients_write on public.edospmis_clients;
create policy edospmis_clients_insert on public.edospmis_clients
  for insert with check (edospmis_has_permission(tenant_id, 'crm.client.manage'));
create policy edospmis_clients_update on public.edospmis_clients
  for update using (edospmis_has_permission(tenant_id, 'crm.client.manage'))
  with check (edospmis_has_permission(tenant_id, 'crm.client.manage'));
create policy edospmis_clients_delete on public.edospmis_clients
  for delete using (edospmis_has_permission(tenant_id, 'crm.client.manage'));

-- edospmis_contract_parties
drop policy edospmis_contract_parties_write on public.edospmis_contract_parties;
create policy edospmis_contract_parties_insert on public.edospmis_contract_parties
  for insert with check (
    edospmis_has_permission(tenant_id, 'legal.contract.edit')
    and exists (select 1 from public.edospmis_contracts c where c.id = edospmis_contract_parties.contract_id and c.status = 'draft')
  );
create policy edospmis_contract_parties_update on public.edospmis_contract_parties
  for update using (
    edospmis_has_permission(tenant_id, 'legal.contract.edit')
    and exists (select 1 from public.edospmis_contracts c where c.id = edospmis_contract_parties.contract_id and c.status = 'draft')
  ) with check (
    edospmis_has_permission(tenant_id, 'legal.contract.edit')
    and exists (select 1 from public.edospmis_contracts c where c.id = edospmis_contract_parties.contract_id and c.status = 'draft')
  );
create policy edospmis_contract_parties_delete on public.edospmis_contract_parties
  for delete using (
    edospmis_has_permission(tenant_id, 'legal.contract.edit')
    and exists (select 1 from public.edospmis_contracts c where c.id = edospmis_contract_parties.contract_id and c.status = 'draft')
  );

-- edospmis_departments
drop policy edospmis_departments_write on public.edospmis_departments;
create policy edospmis_departments_insert on public.edospmis_departments
  for insert with check (edospmis_has_permission(tenant_id, 'admin.org.manage'));
create policy edospmis_departments_update on public.edospmis_departments
  for update using (edospmis_has_permission(tenant_id, 'admin.org.manage'))
  with check (edospmis_has_permission(tenant_id, 'admin.org.manage'));
create policy edospmis_departments_delete on public.edospmis_departments
  for delete using (edospmis_has_permission(tenant_id, 'admin.org.manage'));

-- edospmis_memberships
drop policy edospmis_memberships_write on public.edospmis_memberships;
create policy edospmis_memberships_insert on public.edospmis_memberships
  for insert with check (edospmis_has_permission(tenant_id, 'admin.users.manage'));
create policy edospmis_memberships_update on public.edospmis_memberships
  for update using (edospmis_has_permission(tenant_id, 'admin.users.manage'))
  with check (edospmis_has_permission(tenant_id, 'admin.users.manage'));
create policy edospmis_memberships_delete on public.edospmis_memberships
  for delete using (edospmis_has_permission(tenant_id, 'admin.users.manage'));

-- edospmis_queues
drop policy edospmis_queues_write on public.edospmis_queues;
create policy edospmis_queues_insert on public.edospmis_queues
  for insert with check (edospmis_has_permission(tenant_id, 'admin.workflows.manage'));
create policy edospmis_queues_update on public.edospmis_queues
  for update using (edospmis_has_permission(tenant_id, 'admin.workflows.manage'))
  with check (edospmis_has_permission(tenant_id, 'admin.workflows.manage'));
create policy edospmis_queues_delete on public.edospmis_queues
  for delete using (edospmis_has_permission(tenant_id, 'admin.workflows.manage'));

-- edospmis_quotations
drop policy edospmis_quotations_write on public.edospmis_quotations;
create policy edospmis_quotations_insert on public.edospmis_quotations
  for insert with check (edospmis_has_permission(tenant_id, 'procurement.rfq.send'));
create policy edospmis_quotations_update on public.edospmis_quotations
  for update using (edospmis_has_permission(tenant_id, 'procurement.rfq.send'))
  with check (edospmis_has_permission(tenant_id, 'procurement.rfq.send'));
create policy edospmis_quotations_delete on public.edospmis_quotations
  for delete using (edospmis_has_permission(tenant_id, 'procurement.rfq.send'));

-- edospmis_rfq_suppliers
drop policy edospmis_rfq_suppliers_write on public.edospmis_rfq_suppliers;
create policy edospmis_rfq_suppliers_insert on public.edospmis_rfq_suppliers
  for insert with check (edospmis_has_permission(tenant_id, 'procurement.rfq.send'));
create policy edospmis_rfq_suppliers_update on public.edospmis_rfq_suppliers
  for update using (edospmis_has_permission(tenant_id, 'procurement.rfq.send'))
  with check (edospmis_has_permission(tenant_id, 'procurement.rfq.send'));
create policy edospmis_rfq_suppliers_delete on public.edospmis_rfq_suppliers
  for delete using (edospmis_has_permission(tenant_id, 'procurement.rfq.send'));

-- edospmis_role_permissions
drop policy edospmis_role_permissions_write on public.edospmis_role_permissions;
create policy edospmis_role_permissions_insert on public.edospmis_role_permissions
  for insert with check (exists (
    select 1 from public.edospmis_roles r
    where r.id = edospmis_role_permissions.role_id and edospmis_has_permission(r.tenant_id, 'admin.roles.manage')
  ));
create policy edospmis_role_permissions_update on public.edospmis_role_permissions
  for update using (exists (
    select 1 from public.edospmis_roles r
    where r.id = edospmis_role_permissions.role_id and edospmis_has_permission(r.tenant_id, 'admin.roles.manage')
  )) with check (exists (
    select 1 from public.edospmis_roles r
    where r.id = edospmis_role_permissions.role_id and edospmis_has_permission(r.tenant_id, 'admin.roles.manage')
  ));
create policy edospmis_role_permissions_delete on public.edospmis_role_permissions
  for delete using (exists (
    select 1 from public.edospmis_roles r
    where r.id = edospmis_role_permissions.role_id and edospmis_has_permission(r.tenant_id, 'admin.roles.manage')
  ));

-- edospmis_roles
drop policy edospmis_roles_write on public.edospmis_roles;
create policy edospmis_roles_insert on public.edospmis_roles
  for insert with check (edospmis_has_permission(tenant_id, 'admin.roles.manage') and (not is_system));
create policy edospmis_roles_update on public.edospmis_roles
  for update using (edospmis_has_permission(tenant_id, 'admin.roles.manage') and (not is_system))
  with check (edospmis_has_permission(tenant_id, 'admin.roles.manage') and (not is_system));
create policy edospmis_roles_delete on public.edospmis_roles
  for delete using (edospmis_has_permission(tenant_id, 'admin.roles.manage') and (not is_system));

-- edospmis_sla_policies
drop policy edospmis_sla_policies_write on public.edospmis_sla_policies;
create policy edospmis_sla_policies_insert on public.edospmis_sla_policies
  for insert with check (edospmis_has_permission(tenant_id, 'admin.sla.manage'));
create policy edospmis_sla_policies_update on public.edospmis_sla_policies
  for update using (edospmis_has_permission(tenant_id, 'admin.sla.manage'))
  with check (edospmis_has_permission(tenant_id, 'admin.sla.manage'));
create policy edospmis_sla_policies_delete on public.edospmis_sla_policies
  for delete using (edospmis_has_permission(tenant_id, 'admin.sla.manage'));

-- edospmis_sod_settings
drop policy edospmis_sod_settings_write on public.edospmis_sod_settings;
create policy edospmis_sod_settings_insert on public.edospmis_sod_settings
  for insert with check (edospmis_has_permission(tenant_id, 'admin.approvals.manage'));
create policy edospmis_sod_settings_update on public.edospmis_sod_settings
  for update using (edospmis_has_permission(tenant_id, 'admin.approvals.manage'))
  with check (edospmis_has_permission(tenant_id, 'admin.approvals.manage'));
create policy edospmis_sod_settings_delete on public.edospmis_sod_settings
  for delete using (edospmis_has_permission(tenant_id, 'admin.approvals.manage'));

-- edospmis_suppliers
drop policy edospmis_suppliers_write on public.edospmis_suppliers;
create policy edospmis_suppliers_insert on public.edospmis_suppliers
  for insert with check (edospmis_has_permission(tenant_id, 'procurement.supplier.manage'));
create policy edospmis_suppliers_update on public.edospmis_suppliers
  for update using (edospmis_has_permission(tenant_id, 'procurement.supplier.manage'))
  with check (edospmis_has_permission(tenant_id, 'procurement.supplier.manage'));
create policy edospmis_suppliers_delete on public.edospmis_suppliers
  for delete using (edospmis_has_permission(tenant_id, 'procurement.supplier.manage'));

-- edospmis_teams
drop policy edospmis_teams_write on public.edospmis_teams;
create policy edospmis_teams_insert on public.edospmis_teams
  for insert with check (edospmis_has_permission(tenant_id, 'admin.org.manage'));
create policy edospmis_teams_update on public.edospmis_teams
  for update using (edospmis_has_permission(tenant_id, 'admin.org.manage'))
  with check (edospmis_has_permission(tenant_id, 'admin.org.manage'));
create policy edospmis_teams_delete on public.edospmis_teams
  for delete using (edospmis_has_permission(tenant_id, 'admin.org.manage'));

-- edospmis_user_roles
drop policy edospmis_user_roles_write on public.edospmis_user_roles;
create policy edospmis_user_roles_insert on public.edospmis_user_roles
  for insert with check (edospmis_has_permission(tenant_id, 'admin.users.manage'));
create policy edospmis_user_roles_update on public.edospmis_user_roles
  for update using (edospmis_has_permission(tenant_id, 'admin.users.manage'))
  with check (edospmis_has_permission(tenant_id, 'admin.users.manage'));
create policy edospmis_user_roles_delete on public.edospmis_user_roles
  for delete using (edospmis_has_permission(tenant_id, 'admin.users.manage'));

-- edospmis_workflows
drop policy edospmis_workflows_write on public.edospmis_workflows;
create policy edospmis_workflows_insert on public.edospmis_workflows
  for insert with check (edospmis_has_permission(tenant_id, 'admin.workflows.manage'));
create policy edospmis_workflows_update on public.edospmis_workflows
  for update using (edospmis_has_permission(tenant_id, 'admin.workflows.manage'))
  with check (edospmis_has_permission(tenant_id, 'admin.workflows.manage'));
create policy edospmis_workflows_delete on public.edospmis_workflows
  for delete using (edospmis_has_permission(tenant_id, 'admin.workflows.manage'));
