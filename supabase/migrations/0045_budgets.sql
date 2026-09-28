-- ──────────────────────────────────────────────────────────────────────
-- Budgets, and the money that is already spoken for.
--
-- Approval rules answer "is this person allowed to commit this much". They
-- have never answered "is there anything left". With no budget in the system
-- and nothing reserved when a purchase order is issued, two requests raised
-- on the same morning could each be approved against the same unspent
-- balance, and every individual approval would look correct. That is the
-- ordinary way a budget is overspent inside a system that appears to be
-- controlling it.
--
-- Three ideas, kept separate on purpose:
--
--   allocated   what was set aside for this line this period.
--   committed   orders already issued against it. The obligation exists from
--               the moment the order goes to the supplier, whether or not an
--               invoice has arrived, so it is counted from issue and not
--               from billing.
--   pending     requests approved but not yet ordered. This is the number
--               whose absence causes the double-spend: without it, an
--               approved request is invisible to the next approver.
--
--   available = allocated − committed − pending
--
-- Spend is reported alongside but never subtracted, because every paid
-- invoice sits inside a commitment that has already been counted.
--
-- Nothing here blocks. An over-budget request is allowed through with a
-- recorded reason, because refusing it would push the spend outside the
-- system entirely, which is worse than seeing it. What changes is that the
-- approver is told before they decide instead of afterwards.
-- ──────────────────────────────────────────────────────────────────────

create table if not exists public.edospmis_budget_periods (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.edospmis_tenants(id) on delete cascade,
  name text not null,
  starts_on date not null,
  ends_on date not null,
  is_open boolean not null default true,
  created_at timestamptz not null default now(),
  check (ends_on > starts_on)
);

create table if not exists public.edospmis_budgets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.edospmis_tenants(id) on delete cascade,
  period_id uuid not null references public.edospmis_budget_periods(id) on delete cascade,
  name text not null,
  code text,
  -- Held at a place in the organisation, using the same four columns and the
  -- same normalising trigger as a person or a request (migration 0044), so a
  -- budget line cannot be filed under a department that does not sit in the
  -- business unit it claims.
  business_unit_id uuid references public.edospmis_business_units(id) on delete set null,
  branch_id uuid references public.edospmis_branches(id) on delete set null,
  department_id uuid references public.edospmis_departments(id) on delete set null,
  team_id uuid references public.edospmis_teams(id) on delete set null,
  -- Optional: a line may be for one category of spend, or for anything.
  category_id uuid references public.edospmis_categories(id) on delete set null,
  amount_cents bigint not null default 0 check (amount_cents >= 0),
  currency text not null default 'KES',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists edospmis_budgets_tenant_period_idx on public.edospmis_budgets(tenant_id, period_id);
create index if not exists edospmis_budgets_department_idx on public.edospmis_budgets(tenant_id, department_id);

drop trigger if exists edospmis_budgets_placement on public.edospmis_budgets;
create trigger edospmis_budgets_placement
  before insert or update of business_unit_id, branch_id, department_id, team_id
  on public.edospmis_budgets
  for each row execute function public.edospmis_normalise_placement();

-- A request names the line it is to be met from, and says so if it exceeds it.
alter table public.edospmis_prs
  add column if not exists budget_id uuid references public.edospmis_budgets(id) on delete set null,
  add column if not exists budget_override_reason text;

comment on column public.edospmis_prs.budget_override_reason is
  'Why this request was raised knowing it exceeds the remaining balance. Recorded rather than refused — a blocked request is raised outside the system instead.';

create index if not exists edospmis_prs_budget_idx on public.edospmis_prs(budget_id);

-- ── Row-level security ────────────────────────────────────────────────
-- Any member may read a budget: an approver who cannot see the balance is
-- back where they started. Only admin.org.manage may set one.

alter table public.edospmis_budget_periods enable row level security;
alter table public.edospmis_budgets enable row level security;

drop policy if exists edospmis_budget_periods_select on public.edospmis_budget_periods;
create policy edospmis_budget_periods_select on public.edospmis_budget_periods
  for select using (public.edospmis_is_member(tenant_id));

drop policy if exists edospmis_budget_periods_write on public.edospmis_budget_periods;
create policy edospmis_budget_periods_write on public.edospmis_budget_periods
  for all using (public.edospmis_has_permission(tenant_id, 'admin.org.manage'))
  with check (public.edospmis_has_permission(tenant_id, 'admin.org.manage'));

drop policy if exists edospmis_budgets_select on public.edospmis_budgets;
create policy edospmis_budgets_select on public.edospmis_budgets
  for select using (public.edospmis_is_member(tenant_id));

drop policy if exists edospmis_budgets_write on public.edospmis_budgets;
create policy edospmis_budgets_write on public.edospmis_budgets
  for all using (public.edospmis_has_permission(tenant_id, 'admin.org.manage'))
  with check (public.edospmis_has_permission(tenant_id, 'admin.org.manage'));

grant select on public.edospmis_budget_periods to authenticated;
grant select on public.edospmis_budgets to authenticated;
grant insert, update, delete on public.edospmis_budget_periods to authenticated;
grant insert, update, delete on public.edospmis_budgets to authenticated;

-- ── What is left on a line ────────────────────────────────────────────

create or replace function public.edospmis_budget_status(p_budget_id uuid)
returns table (
  allocated_cents bigint,
  committed_cents bigint,
  pending_cents bigint,
  spent_cents bigint,
  available_cents bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with b as (
    select id, amount_cents from public.edospmis_budgets where id = p_budget_id
  ),
  -- Orders raised against requests on this line. Counted from issue, because
  -- that is when the obligation exists. A cancelled order is not an
  -- obligation, so it is excluded.
  orders as (
    select po.id, po.total_cents
    from public.edospmis_purchase_orders po
    join public.edospmis_prs pr on pr.case_id = po.case_id
    where pr.budget_id = p_budget_id
      and po.status in ('pending_approval', 'issued', 'closed')
  ),
  -- Requests cleared to buy but not yet ordered. Without this the next
  -- approver sees an unspent balance that is already claimed.
  pending as (
    select coalesce(sum(pr.estimated_cost_cents), 0)::bigint as amt
    from public.edospmis_prs pr
    join public.edospmis_cases c on c.id = pr.case_id
    where pr.budget_id = p_budget_id
      and c.status in ('approved', 'procurement', 'po_approval')
      and not exists (select 1 from public.edospmis_purchase_orders po where po.case_id = pr.case_id)
  ),
  spent as (
    select coalesce(sum(i.subtotal_cents), 0)::bigint as amt
    from public.edospmis_invoices i
    where i.status = 'paid' and i.po_id in (select id from orders)
  )
  select
    b.amount_cents,
    coalesce((select sum(total_cents) from orders), 0)::bigint,
    pending.amt,
    spent.amt,
    -- Spend is inside commitment and is never subtracted twice.
    (b.amount_cents - coalesce((select sum(total_cents) from orders), 0) - pending.amt)::bigint
  from b, pending, spent;
$$;

revoke all on function public.edospmis_budget_status(uuid) from public;
revoke all on function public.edospmis_budget_status(uuid) from anon;
grant execute on function public.edospmis_budget_status(uuid) to authenticated;
