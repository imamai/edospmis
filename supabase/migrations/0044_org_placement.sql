-- ──────────────────────────────────────────────────────────────────────
-- Putting people and requests somewhere in the organisation.
--
-- The hierarchy was modelled and never connected. Business units, branches,
-- departments and teams could all be created, and the reports were written to
-- group by department — but nothing in the application ever attached a person
-- or a request to any of them. `edospmis_memberships` carried department_id
-- and branch_id that nothing wrote; `edospmis_prs.department_id` was read by
-- every report and set by no code path; and a team could be created but never
-- joined, because no column anywhere referenced one.
--
-- That is why every departmental column in every report reads a dash.
--
-- Two decisions here are worth stating.
--
-- First, the placement is stored in full — business unit, branch, department
-- and team on the same row — rather than storing the deepest level and
-- joining upward on read. Reports group and filter on all four, and a
-- four-table climb on every row of a cycle-time report is a cost paid on
-- every page load to save four nullable columns.
--
-- Second, because it is stored in full it can contradict itself, so nothing
-- is trusted to write it consistently. A trigger normalises every write:
-- whatever the deepest level supplied is, the ancestors are derived from it
-- and anything else the caller passed is overwritten. A team in Finance
-- cannot be filed under Operations, however the row was written — by the
-- application, by an import, or by hand.
-- ──────────────────────────────────────────────────────────────────────

alter table public.edospmis_memberships
  add column if not exists business_unit_id uuid references public.edospmis_business_units(id) on delete set null,
  add column if not exists team_id uuid references public.edospmis_teams(id) on delete set null;

alter table public.edospmis_prs
  add column if not exists business_unit_id uuid references public.edospmis_business_units(id) on delete set null,
  add column if not exists branch_id uuid references public.edospmis_branches(id) on delete set null,
  add column if not exists team_id uuid references public.edospmis_teams(id) on delete set null;

comment on column public.edospmis_memberships.team_id is
  'Where this person sits. Set the deepest level that applies; the trigger derives the rest.';
comment on column public.edospmis_prs.team_id is
  'Where this request was raised from. Defaults from the requester''s own placement, and can be overridden on the form.';

create index if not exists edospmis_memberships_department_idx on public.edospmis_memberships(tenant_id, department_id);
create index if not exists edospmis_prs_department_idx on public.edospmis_prs(tenant_id, department_id);
create index if not exists edospmis_prs_team_idx on public.edospmis_prs(tenant_id, team_id);

-- ── Normalisation ─────────────────────────────────────────────────────

create or replace function public.edospmis_normalise_placement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team record;
  v_dept record;
  v_branch record;
begin
  -- Deepest wins, and each level is re-derived from the one below it. A
  -- caller that passes a team and a contradicting department gets the team's
  -- department, not an error: the deepest choice is the specific one, and
  -- refusing the write would only push the inconsistency somewhere quieter.
  if new.team_id is not null then
    select * into v_team from public.edospmis_teams where id = new.team_id and tenant_id = new.tenant_id;
    if v_team is null then
      raise exception 'That team does not belong to this workspace.';
    end if;
    new.department_id := v_team.department_id;
  end if;

  if new.department_id is not null then
    select * into v_dept from public.edospmis_departments where id = new.department_id and tenant_id = new.tenant_id;
    if v_dept is null then
      raise exception 'That department does not belong to this workspace.';
    end if;
    new.branch_id := v_dept.branch_id;
    new.business_unit_id := v_dept.business_unit_id;
  end if;

  if new.branch_id is not null then
    select * into v_branch from public.edospmis_branches where id = new.branch_id and tenant_id = new.tenant_id;
    if v_branch is null then
      raise exception 'That branch does not belong to this workspace.';
    end if;
    -- A department may hang off a branch, off a business unit directly, or
    -- off both. Where the department named one, keep it; otherwise take the
    -- branch's.
    new.business_unit_id := coalesce(new.business_unit_id, v_branch.business_unit_id);
  end if;

  if new.business_unit_id is not null
     and not exists (select 1 from public.edospmis_business_units
                      where id = new.business_unit_id and tenant_id = new.tenant_id) then
    raise exception 'That business unit does not belong to this workspace.';
  end if;

  return new;
end;
$$;

drop trigger if exists edospmis_memberships_placement on public.edospmis_memberships;
create trigger edospmis_memberships_placement
  before insert or update of business_unit_id, branch_id, department_id, team_id
  on public.edospmis_memberships
  for each row execute function public.edospmis_normalise_placement();

drop trigger if exists edospmis_prs_placement on public.edospmis_prs;
create trigger edospmis_prs_placement
  before insert or update of business_unit_id, branch_id, department_id, team_id
  on public.edospmis_prs
  for each row execute function public.edospmis_normalise_placement();

-- ── Keep the case in step with its request ────────────────────────────
-- `edospmis_cases.department_id` has existed since the beginning and several
-- reports fall back to it. Rather than ask every write path to remember it,
-- the request mirrors its own department onto its case.

create or replace function public.edospmis_sync_case_department()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.edospmis_cases
  set department_id = new.department_id
  where id = new.case_id
    and department_id is distinct from new.department_id;
  return null;
end;
$$;

drop trigger if exists edospmis_prs_sync_case_department on public.edospmis_prs;
create trigger edospmis_prs_sync_case_department
  after insert or update of department_id on public.edospmis_prs
  for each row execute function public.edospmis_sync_case_department();

-- ── Backfill ──────────────────────────────────────────────────────────
-- Nothing has ever been placed, so there is nothing to derive from. What can
-- be done is make the existing rows self-consistent, which the trigger does
-- on any future write, and leave the placement itself to be entered.
-- Recorded here so the empty columns are understood as unset rather than lost.

update public.edospmis_prs pr
set department_id = pr.department_id
where pr.department_id is not null;
