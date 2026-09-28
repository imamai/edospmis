-- Plans, trials and subscriptions: the price list stops being marketing copy.
--
-- Until now "KES 4,500 a month" and "14 days free" existed only in
-- src/lib/plans.ts and on the public pages. Nothing in the database knew what
-- a workspace was on, when its trial ended, or whether anyone had paid — so
-- the promise on the landing page and the state of the product could not
-- disagree, because the product had no opinion at all.
--
-- What this adds:
--   * edospmis_plans                  — the published price list, one row per plan
--   * edospmis_subscriptions          — one row per tenant: plan, status, trial end
--   * edospmis_subscription_payments  — what was actually received, and for what
--   * a trigger so every new workspace starts a real 14-day trial
--   * a backfill so no existing workspace is suddenly without a subscription
--
-- What it deliberately does NOT add: a payment gateway, and any gating of
-- features. Money is *recorded* here, not collected — an owner or accountant
-- enters the M-Pesa or bank reference they were paid against, which is how
-- EDOS Centre actually invoices today. And an expired trial does not lock
-- anybody out of their own records; that is a business decision to take
-- deliberately, not a side effect of a schema migration.

-- ------------------------------------------------------------------ plans --

create type edospmis_sub_status as enum (
  'trialing',   -- inside the free period, never charged
  'active',     -- paid, inside the period that payment covers
  'past_due',   -- the period ended and nothing has been recorded since
  'cancelled',  -- the customer stopped
  'expired'     -- the trial ended without a payment
);

create table edospmis_plans (
  id                   uuid primary key default gen_random_uuid(),
  code                 text not null unique,
  name                 text not null,
  tagline              text,
  price_cents          bigint not null default 0 check (price_cents >= 0),
  currency             text not null default 'KES',
  billing_period       text not null default 'month'
                         check (billing_period in ('month', 'year')),
  -- Null means "quoted per organisation", which is what the published pages
  -- say: the onboarding job for a one-team workspace and for a five-department
  -- authority matrix are not the same work, so the fee follows the plan and is
  -- written down per customer rather than advertised.
  onboarding_fee_cents bigint check (onboarding_fee_cents >= 0),
  max_users            integer,
  features             jsonb not null default '[]'::jsonb,
  is_popular           boolean not null default false,
  is_active            boolean not null default true,
  sort_order           integer not null default 0,
  created_at           timestamptz not null default now()
);

comment on table edospmis_plans is
  'The published price list. The public pricing page reads this, so what is advertised and what is billed cannot drift apart.';

-- ------------------------------------------------------------ trial length --

-- One place the figure lives on this side of the wire. src/lib/plans.ts holds
-- the same number for the copy that talks about it; change one and change the
-- other, which is why they are both called TRIAL_DAYS.
create function edospmis_trial_days()
returns integer
language sql
immutable
as $$ select 14 $$;

-- ----------------------------------------------------------- subscriptions --

create table edospmis_subscriptions (
  id                 uuid primary key default gen_random_uuid(),
  -- One per tenant. History lives in the payments table below, which is the
  -- part anybody actually needs to audit.
  tenant_id          uuid not null unique references edospmis_tenants (id) on delete cascade,
  plan_id            uuid not null references edospmis_plans (id),
  status             edospmis_sub_status not null default 'trialing',
  started_at         timestamptz not null default now(),
  trial_ends_at      timestamptz,
  current_period_end timestamptz,
  cancel_at          timestamptz,
  note               text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on column edospmis_subscriptions.status is
  'The recorded state. The state in force is derived: a trialing row whose trial_ends_at has passed reads as expired without anything having to run at midnight.';

create index edospmis_subscriptions_plan_idx on edospmis_subscriptions (plan_id);

create table edospmis_subscription_payments (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references edospmis_tenants (id) on delete cascade,
  subscription_id uuid references edospmis_subscriptions (id) on delete set null,
  plan_id         uuid references edospmis_plans (id) on delete set null,
  kind            text not null default 'subscription'
                    check (kind in ('subscription', 'onboarding')),
  provider        text not null default 'mpesa'
                    check (provider in ('mpesa', 'bank', 'cash', 'other')),
  -- The gateway's or the bank's own reference. No card data, no credentials,
  -- no payload we are not entitled to hold.
  reference       text,
  amount_cents    bigint not null check (amount_cents >= 0),
  currency        text not null default 'KES',
  months          integer check (months > 0),
  covers_from     timestamptz,
  covers_to       timestamptz,
  recorded_by     uuid,
  note            text,
  paid_at         timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

create index edospmis_subscription_payments_tenant_idx
  on edospmis_subscription_payments (tenant_id, paid_at desc);

-- ------------------------------------------------------------- the seeding --

insert into edospmis_plans
  (code, name, tagline, price_cents, max_users, features, is_popular, sort_order)
values
  ('starter', 'Starter', 'One buying team, properly organised', 450000, 5,
   '["Requisitions with an approval chain","Purchase orders and supplier register","Quotations and award decisions","Goods received notes and inspection","Case timeline and stage history","PDF and Excel exports"]'::jsonb,
   false, 1),
  ('growth', 'Growth', 'Procurement with a finance trail behind it', 750000, 20,
   '["Everything in Starter","Three-way match: order, receipt, invoice","Match tolerances and exception handling","Payments, AP ageing and duplicate-payment blocks","Contracts with e-signature","Budget commitments against each order","SLA clocks and breach reporting"]'::jsonb,
   true, 2),
  ('pro', 'Pro', 'Many departments, one audit trail', 1000000, null,
   '["Everything in Growth","Multi-department workflows and delegation","Tender evaluation committees and scoring","Segregation-of-duties controls","Full audit log and platform reporting","API access and webhooks","Priority support"]'::jsonb,
   false, 3);

-- ------------------------------------------------ a trial for every tenant --

create function edospmis_start_trial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into edospmis_subscriptions (tenant_id, plan_id, status, trial_ends_at, current_period_end)
  select
    new.id,
    p.id,
    'trialing',
    now() + make_interval(days => edospmis_trial_days()),
    -- The period end matches the trial end rather than running past it: a
    -- trialing workspace should never look as though it has a paid period
    -- outstanding.
    now() + make_interval(days => edospmis_trial_days())
  from edospmis_plans p
  where p.is_active
  order by p.sort_order
  limit 1
  on conflict (tenant_id) do nothing;

  return new;
end;
$$;

create trigger edospmis_tenants_start_trial
after insert on edospmis_tenants
for each row execute function edospmis_start_trial();

-- Existing workspaces were here before any of this and have never been told
-- about a trial, so they get a fresh one from today rather than a backdated
-- one that would read as already expired.
insert into edospmis_subscriptions (tenant_id, plan_id, status, trial_ends_at, current_period_end, note)
select
  t.id,
  (select p.id from edospmis_plans p where p.is_active order by p.sort_order limit 1),
  'trialing',
  now() + make_interval(days => edospmis_trial_days()),
  now() + make_interval(days => edospmis_trial_days()),
  'Trial opened when subscriptions were introduced; this workspace predates them.'
from edospmis_tenants t
on conflict (tenant_id) do nothing;

-- -------------------------------------------------------------------- RLS --

alter table edospmis_plans enable row level security;
alter table edospmis_subscriptions enable row level security;
alter table edospmis_subscription_payments enable row level security;

-- The price list is public on purpose: the pricing page has to read it before
-- anybody has signed in, and it is the same list we advertise anyway.
create policy edospmis_plans_read on edospmis_plans
  for select to anon, authenticated using (true);

create policy edospmis_subscriptions_read on edospmis_subscriptions
  for select to authenticated
  using (edospmis_is_member(tenant_id) or edospmis_is_platform_admin());

-- What was paid is money, so it follows the same gate as the rest of the
-- organisation's administration rather than being visible to every member.
create policy edospmis_subscription_payments_read on edospmis_subscription_payments
  for select to authenticated
  using (
    edospmis_has_permission(tenant_id, 'admin.org.manage')
    or edospmis_is_platform_admin()
  );

-- No insert/update/delete policies anywhere here. Both tables are written only
-- by the SECURITY DEFINER functions below, so a plan cannot be changed and a
-- payment cannot be invented by anything that merely holds a session.

-- ------------------------------------------------------------------- RPCs --

-- Choosing the plan you intend to be on. Allowed during a trial and while
-- active; it does not take money and does not extend anything.
create function edospmis_set_plan(p_tenant_id uuid, p_plan_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan uuid;
begin
  if not edospmis_has_permission(p_tenant_id, 'admin.org.manage') then
    raise exception 'edospmis: you are not allowed to change this workspace''s plan';
  end if;

  select id into v_plan from edospmis_plans where code = p_plan_code and is_active;
  if v_plan is null then
    raise exception 'edospmis: unknown plan %', p_plan_code;
  end if;

  update edospmis_subscriptions
     set plan_id = v_plan, updated_at = now()
   where tenant_id = p_tenant_id;

  if not found then
    raise exception 'edospmis: this workspace has no subscription';
  end if;
end;
$$;

-- Recording money that has already been received. There is no gateway behind
-- this: somebody was paid by M-Pesa or bank transfer and is entering the
-- reference, which is how EDOS Centre invoices today. It extends the paid
-- period from whichever is later — now, or the end of the period already
-- paid for — so paying early never loses the customer days.
create function edospmis_record_subscription_payment(
  p_tenant_id    uuid,
  p_plan_code    text,
  p_kind         text,
  p_provider     text,
  p_reference    text,
  p_amount_cents bigint,
  p_months       integer,
  p_paid_at      timestamptz,
  p_note         text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan    uuid;
  v_sub     edospmis_subscriptions;
  v_from    timestamptz;
  v_to      timestamptz;
  v_payment uuid;
begin
  if not edospmis_has_permission(p_tenant_id, 'admin.org.manage') then
    raise exception 'edospmis: you are not allowed to record payments for this workspace';
  end if;
  if p_amount_cents is null or p_amount_cents < 0 then
    raise exception 'edospmis: the amount must be zero or more';
  end if;
  if coalesce(p_kind, 'subscription') not in ('subscription', 'onboarding') then
    raise exception 'edospmis: unknown payment kind %', p_kind;
  end if;

  select * into v_sub from edospmis_subscriptions where tenant_id = p_tenant_id;
  if v_sub is null then
    raise exception 'edospmis: this workspace has no subscription';
  end if;

  select id into v_plan from edospmis_plans where code = p_plan_code;
  v_plan := coalesce(v_plan, v_sub.plan_id);

  if coalesce(p_kind, 'subscription') = 'subscription' then
    if coalesce(p_months, 0) < 1 then
      raise exception 'edospmis: say how many months this payment covers';
    end if;
    v_from := greatest(coalesce(p_paid_at, now()), coalesce(v_sub.current_period_end, now()));
    -- A trial is not a paid period, so paying during one starts the paid
    -- period now rather than stacking on top of the free days.
    if v_sub.status = 'trialing' then
      v_from := coalesce(p_paid_at, now());
    end if;
    v_to := v_from + make_interval(months => p_months);

    update edospmis_subscriptions
       set plan_id            = v_plan,
           status             = 'active',
           current_period_end = v_to,
           trial_ends_at      = case when status = 'trialing' then trial_ends_at else trial_ends_at end,
           updated_at         = now()
     where tenant_id = p_tenant_id;
  end if;

  insert into edospmis_subscription_payments
    (tenant_id, subscription_id, plan_id, kind, provider, reference, amount_cents,
     months, covers_from, covers_to, recorded_by, note, paid_at)
  values
    (p_tenant_id, v_sub.id, v_plan, coalesce(p_kind, 'subscription'),
     coalesce(p_provider, 'mpesa'), nullif(trim(coalesce(p_reference, '')), ''),
     p_amount_cents, p_months, v_from, v_to, auth.uid(),
     nullif(trim(coalesce(p_note, '')), ''), coalesce(p_paid_at, now()))
  returning id into v_payment;

  return v_payment;
end;
$$;

grant execute on function edospmis_set_plan(uuid, text) to authenticated;
grant execute on function edospmis_record_subscription_payment(
  uuid, text, text, text, text, bigint, integer, timestamptz, text
) to authenticated;
grant execute on function edospmis_trial_days() to anon, authenticated;
