-- ──────────────────────────────────────────────────────────────────────
-- Telling people a case is waiting on them.
--
-- A case moves through eight hands. Each handover was silent: the requisition
-- sat in an approver's queue until they happened to look, the quotation
-- arrived with nobody told, the invoice waited for an approval nobody knew
-- was theirs. The system knew exactly who should act and never said so.
--
-- Four decisions, and the reasoning matters more than the schema.
--
-- ROUTED BY PERMISSION, NOT BY PERSON. A case is not assigned to Jane, it is
-- waiting for whoever approves invoices. Assigning to a person means work
-- stops when that person is on leave; routing by permission means whoever
-- holds the job sees it.
--
-- FANNED OUT, THEN CLAIMED. Every holder of the permission gets a row, so
-- nothing waits on one inbox. The moment any of them acts, the rest are
-- resolved — because five people chasing one requisition is the failure mode
-- that makes people turn notifications off, and an unresolved notification
-- for work already done is worse than none.
--
-- IN-APP ALWAYS, EMAIL ONLY WHEN IT BLOCKS. Everything lands in the bell.
-- Email is reserved for the handovers where nothing moves until somebody
-- decides — an approval, a payment. "A quotation arrived" is worth seeing;
-- it is not worth an email to four people, and a system that sends one
-- teaches them to filter it, which costs the emails that mattered.
--
-- ONE ROW PER PERSON. Read state is personal. A shared row marked read by
-- the first person to glance at it hides the work from everybody else.
-- ──────────────────────────────────────────────────────────────────────

create table if not exists public.edospmis_notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.edospmis_tenants(id) on delete cascade,
  user_id uuid not null references public.edospmis_users(id) on delete cascade,
  case_id uuid references public.edospmis_cases(id) on delete cascade,
  -- What happened, as a stable key: 'pr.submitted', 'quotation.received',
  -- 'po.pending_approval', 'invoice.submitted', 'delivery.confirmed'. Used to
  -- resolve a whole class at once when the work is done, which is why it is a
  -- key and not a sentence.
  kind text not null,
  title text not null,
  body text,
  -- Where acting on it happens. Always within the app.
  href text not null,
  read_at timestamptz,
  -- Set when the thing it was about has been dealt with, by anybody. A
  -- notification that outlives its work is the reason people stop reading
  -- them.
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

-- The bell's own query: mine, unresolved, newest first.
create index if not exists edospmis_notifications_inbox_idx
  on public.edospmis_notifications(user_id, resolved_at, created_at desc);

create index if not exists edospmis_notifications_case_kind_idx
  on public.edospmis_notifications(case_id, kind);

alter table public.edospmis_notifications enable row level security;

-- Yours and nobody else's. No tenant-wide read: a notification names work and
-- who it is waiting on, which is not everybody's business.
drop policy if exists edospmis_notifications_select on public.edospmis_notifications;
create policy edospmis_notifications_select on public.edospmis_notifications
  for select using (user_id = (select auth.uid()));

-- Marking your own as read. Nothing else is writable from a session: rows are
-- created by the fan-out function below, which decides who gets them.
drop policy if exists edospmis_notifications_update on public.edospmis_notifications;
create policy edospmis_notifications_update on public.edospmis_notifications
  for update using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant select, update on public.edospmis_notifications to authenticated;

-- ── Fanning out ───────────────────────────────────────────────────────
--
-- Everybody in this tenant holding the permission, minus the person who
-- caused it. Telling somebody about their own action is noise, and it is the
-- first thing that makes a bell feel broken.
--
-- Returns the addresses of the people notified, so the caller can decide
-- whether this one also warrants an email without a second round trip.

create or replace function public.edospmis_notify(
  p_tenant_id uuid,
  p_case_id uuid,
  p_kind text,
  p_title text,
  p_body text,
  p_href text,
  p_permission text
)
returns table (user_id uuid, email text, full_name text)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  return query
  with recipients as (
    select distinct u.id, u.email, u.full_name
    from public.edospmis_users u
    join public.edospmis_memberships m
      on m.user_id = u.id and m.tenant_id = p_tenant_id and m.status = 'active'
    join public.edospmis_user_roles ur
      on ur.user_id = u.id and ur.tenant_id = p_tenant_id
    join public.edospmis_role_permissions rp on rp.role_id = ur.role_id
    join public.edospmis_permissions p
      on p.id = rp.permission_id and p.key = p_permission
    where u.id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
  ),
  inserted as (
    insert into public.edospmis_notifications
      (tenant_id, user_id, case_id, kind, title, body, href)
    select p_tenant_id, r.id, p_case_id, p_kind, p_title, nullif(p_body, ''), p_href
    from recipients r
    returning edospmis_notifications.user_id
  )
  select r.id, r.email, r.full_name from recipients r
  where r.id in (select inserted.user_id from inserted);
end;
$$;

-- ── Resolving ─────────────────────────────────────────────────────────
--
-- Called when the work is done, by whoever did it. Clears the whole class for
-- that case, for everybody — which is the half that stops a fan-out becoming
-- a pile.

create or replace function public.edospmis_resolve_notifications(
  p_case_id uuid,
  p_kind text
)
returns void
language sql
security definer
set search_path = public, auth
as $$
  update public.edospmis_notifications
     set resolved_at = now()
   where case_id = p_case_id
     and kind = p_kind
     and resolved_at is null;
$$;

revoke all on function public.edospmis_notify(uuid, uuid, text, text, text, text, text) from public;
revoke all on function public.edospmis_notify(uuid, uuid, text, text, text, text, text) from anon;
grant execute on function public.edospmis_notify(uuid, uuid, text, text, text, text, text) to authenticated;

revoke all on function public.edospmis_resolve_notifications(uuid, text) from public;
revoke all on function public.edospmis_resolve_notifications(uuid, text) from anon;
grant execute on function public.edospmis_resolve_notifications(uuid, text) to authenticated;
