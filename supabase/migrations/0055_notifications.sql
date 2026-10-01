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

-- ── Telling one named person ──────────────────────────────────────────
--
-- The permission fan-out above covers "whoever does this job". It cannot
-- cover the requester, who is one particular person and holds no special
-- permission — and the requester is who most of the downstream events are
-- actually for. Their request was approved, their goods arrived, their
-- invoice was paid: none of that is a job anybody holds a permission for.
--
-- Silent where the person is the one who caused it, for the same reason as
-- the fan-out.

create or replace function public.edospmis_notify_user(
  p_tenant_id uuid,
  p_user_id uuid,
  p_case_id uuid,
  p_kind text,
  p_title text,
  p_body text,
  p_href text
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if p_user_id is null or p_user_id = auth.uid() then
    return;
  end if;

  insert into public.edospmis_notifications
    (tenant_id, user_id, case_id, kind, title, body, href)
  values
    (p_tenant_id, p_user_id, p_case_id, p_kind, p_title, nullif(p_body, ''), p_href);
end;
$$;

revoke all on function public.edospmis_notify_user(uuid, uuid, uuid, text, text, text, text) from public;
revoke all on function public.edospmis_notify_user(uuid, uuid, uuid, text, text, text, text) from anon;
grant execute on function public.edospmis_notify_user(uuid, uuid, uuid, text, text, text, text) to authenticated;

-- ── The whole journey ─────────────────────────────────────────────────
--
-- Every handover, draft to closed, and who hears about it. This catalogue is
-- the specification the application follows; it lives here rather than only
-- in the code because the routing is a procurement decision, not a frontend
-- one, and the next person to add a stage needs to see the pattern.
--
-- "Blocks" means nothing moves until that person acts — those also go out by
-- email. Everything else is the bell alone, for the reasons at the top of
-- this file.
--
--   STAGE          EVENT                     GOES TO                      BLOCKS
--   draft          (nothing)                 —                            —
--                    A draft is the requester's own. Telling them about
--                    their own typing is how a bell starts being ignored.
--
--   approval       pr.submitted              procurement.pr.approve       yes
--                  pr.approved               the requester                no
--                  pr.approved               procurement.rfq.create       yes
--                  pr.rejected               the requester                yes
--                  pr.returned               the requester                yes
--                    Returned is the one people miss: the request is
--                    sitting with them and looks, from their side, exactly
--                    like one still being considered.
--
--   procurement    quotation.received        procurement.rfq.evaluate     no
--                  bid.submitted             procurement.rfq.evaluate     no
--                  rfq.closing_today         procurement.rfq.evaluate     no
--                    A closing date nobody is told about is a closing date
--                    that passes with two of five bids in.
--
--   po_approval    po.pending_approval       procurement.po.approve       yes
--                  po.issued                 the requester                no
--                  po.issued                 receiving.grn.create         no
--
--   receiving      grn.recorded              finance.invoice.create       no
--                  grn.recorded              the requester                no
--                  grn.inspection_failed     procurement.po.view          yes
--                    A failed inspection is the only receiving event that
--                    stops the line, so it is the only one that emails.
--
--   finance        invoice.submitted         finance.invoice.approve      yes
--                  invoice.exception         finance.invoice.create       yes
--                  invoice.approved          finance.payment.approve      yes
--                  payment.recorded          the requester                no
--
--   delivery       delivery.scheduled        the requester                no
--                  delivery.dispatched       the requester                no
--
--   closed         case.closed               the requester                no
--
--   any stage      case.on_hold              the requester                no
--                  case.blocked              the requester                yes
--                    Blocked means somebody outside the case has to do
--                    something, and nobody is watching for it.
--
-- Each of these resolves when its work is done:
-- edospmis_resolve_notifications(case_id, kind), called by whoever acts.
