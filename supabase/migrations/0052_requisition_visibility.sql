-- ──────────────────────────────────────────────────────────────────────
-- Who can see which requisitions, and who has a signature.
--
-- `procurement.pr.view` meant "can open the requisitions screen", and the
-- row-level policy behind it was `edospmis_is_member(tenant_id)` — so every
-- member of a workspace could read every requisition in it, including what
-- each one is worth and who raised it. A Requester holds that permission.
--
-- The screen was therefore not showing a requester too much by accident; the
-- data really was open to them, and hiding the menu item would have hidden
-- the page while leaving the rows readable to anything that asked.
--
-- So the distinction moves into the permission, and the policy enforces it —
-- which means it holds whether somebody uses the screen or the API.
--
--   procurement.pr.view        the requisitions that concern you: the ones
--                              you raised, and the ones waiting on a
--                              decision from a role you hold.
--   procurement.pr.view.all    every requisition in the workspace.
--
-- Receiving and delivery are untouched here on purpose. A storekeeper has to
-- open a case they neither raised nor approved, and case visibility is a
-- larger question than requisition visibility — worth doing separately, and
-- carefully, rather than folded into this.
-- ──────────────────────────────────────────────────────────────────────

insert into public.edospmis_permissions (key, category, description) values
  ('procurement.pr.view.all', 'procurement', 'See every requisition in the workspace'),
  ('signature.manage', 'admin', 'Hold a signature used on approvals and documents')
on conflict (key) do nothing;

-- ── Who sees everything ───────────────────────────────────────────────
--
-- The roles whose job is the pipeline rather than their own corner of it.
-- Deliberately not Requester, and deliberately not Approver: an approver sees
-- what is routed to them, which the policy below grants without needing this.

insert into public.edospmis_role_permissions (role_id, permission_id)
select r.id, p.id
from public.edospmis_roles r
cross join public.edospmis_permissions p
where p.key = 'procurement.pr.view.all'
  and r.name in (
    'Tenant Administrator',
    'Procurement Manager',
    'Procurement Officer',
    'Department Manager',
    'Finance Officer',
    'Finance Manager',
    'Auditor',
    'Executive'
  )
on conflict (role_id, permission_id) do nothing;

-- ── Who has a signature ───────────────────────────────────────────────
--
-- A signature appears on an approval, a purchase order or a contract. Giving
-- one to somebody who signs none of those is at best clutter and at worst
-- misleading — it suggests an authority they do not have.

insert into public.edospmis_role_permissions (role_id, permission_id)
select r.id, p.id
from public.edospmis_roles r
cross join public.edospmis_permissions p
where p.key = 'signature.manage'
  and r.name in (
    'Tenant Administrator',
    'Procurement Manager',
    'Procurement Officer',
    'Department Manager',
    'Approver',
    'Finance Officer',
    'Finance Manager',
    'Executive'
  )
on conflict (role_id, permission_id) do nothing;

-- ── The policy ────────────────────────────────────────────────────────
--
-- Three ways to see a requisition, in the order they cost anything to check:
-- the broad permission, your own row, and finally the approval join — which
-- is the expensive one and so is tried last.

drop policy if exists edospmis_prs_select on public.edospmis_prs;
create policy edospmis_prs_select on public.edospmis_prs
  for select using (
    public.edospmis_has_permission(tenant_id, 'procurement.pr.view.all')
    or requester_id = (select auth.uid())
    or exists (
      -- Routed to a role this person holds, whether it is still pending or
      -- already decided: an approver who could see a request last week must
      -- still be able to open what they approved.
      select 1
      from public.edospmis_approvals a
      join public.edospmis_user_roles ur
        on ur.role_id = a.role_id
       and ur.tenant_id = a.tenant_id
      where a.case_id = public.edospmis_prs.case_id
        and ur.user_id = (select auth.uid())
    )
  );

comment on policy edospmis_prs_select on public.edospmis_prs is
  'Requisitions you raised, ones routed to a role you hold, or everything if '
  'you have procurement.pr.view.all. Replaces a policy that let any member '
  'read every requisition in the workspace.';
