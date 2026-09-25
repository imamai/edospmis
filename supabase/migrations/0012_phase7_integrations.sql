-- EDOSPMIS Phase 7 — Integrations (PRD NG1/FR-31, ARCHITECTURE.md §14/§18
-- roadmap: "webhooks, accounting/ERP export, e-signature — at least one
-- real external integration live, not a mock").
--
-- Scope cuts, same honesty discipline as every prior migration:
--   - Webhooks are the one built for real here, end-to-end, with a live
--     external endpoint in the verification pass (not a stub) — the
--     Supabase project already has `pg_net` (async HTTP) and `pgcrypto`
--     enabled, which is exactly the "webhooks + signed payloads" surface
--     ARCHITECTURE.md §14 already designed.
--   - One event pipeline, two consumers, also per §14: dispatch is a
--     trigger on `edospmis_audit_logs`, the log every RPC since Phase 1
--     already writes to — not a new, separate `edospmis_events` table
--     duplicating what audit logging already captures. Every domain event
--     from every phase (pr.submitted, po.issued, invoice.paid,
--     case.closed, delegation.created, ...) is a webhook candidate for
--     free, with no changes to any existing RPC.
--   - A webhook failing (bad URL, unreachable host, timeout) must never
--     break the business transaction that produced the audit log entry —
--     the dispatch trigger swallows its own errors per webhook.
--   - Delivery status is checked on demand (a "Refresh status" action
--     reading `net._http_response`), not swept automatically — a
--     scheduled retry/backoff policy is real, separate follow-up work
--     once a tenant's integration actually needs guaranteed delivery
--     rather than best-effort.
--   - Accounting/ERP export (FR-31) ships as a CSV of invoices — this is
--     the "integration-ready export" the PRD explicitly scopes finance
--     to, not a native ledger or a specific ERP's own API.
--   - E-signature is NOT built here — Phase 3's contract v1 already
--     documented "no secure external signing link yet" as deferred, and
--     that remains true; there is no live e-signature account to
--     integrate against honestly, and a mocked one would violate the
--     "not a mock" bar this phase is held to. Revisit when a tenant
--     actually needs it and a real provider account exists to build
--     against.

create table public.edospmis_webhooks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.edospmis_tenants (id) on delete cascade,
  url text not null,
  secret text not null,
  -- Empty = every event. Otherwise an action must start with one of these
  -- prefixes (e.g. '{invoice.,po.}') to be delivered to this endpoint.
  event_prefixes text[] not null default '{}',
  is_active boolean not null default true,
  created_by uuid references public.edospmis_users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.edospmis_webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  webhook_id uuid not null references public.edospmis_webhooks (id) on delete cascade,
  tenant_id uuid not null references public.edospmis_tenants (id) on delete cascade,
  event text not null,
  payload jsonb not null,
  request_id bigint,
  response_status int,
  response_body text,
  checked_at timestamptz,
  created_at timestamptz not null default now()
);

create index edospmis_webhooks_tenant_idx on public.edospmis_webhooks (tenant_id) where is_active;
create index edospmis_webhook_deliveries_webhook_idx on public.edospmis_webhook_deliveries (webhook_id, created_at desc);

insert into public.edospmis_permissions (key, category, description) values
  ('admin.webhooks.manage', 'admin', 'Create and manage outbound webhooks');

alter table public.edospmis_webhooks enable row level security;
alter table public.edospmis_webhook_deliveries enable row level security;

create policy edospmis_webhooks_select on public.edospmis_webhooks
  for select using (public.edospmis_is_member(tenant_id));
-- No write policy: only the RPCs below (security definer) write here — a
-- webhook's secret is generated server-side and shown once, never editable
-- by direct row update.

create policy edospmis_webhook_deliveries_select on public.edospmis_webhook_deliveries
  for select using (public.edospmis_is_member(tenant_id));
-- No write policy: only the dispatch trigger and the status-check RPC write here.

-- ── Create a webhook: generates and returns the secret once ─────────────

create or replace function public.edospmis_create_webhook(p_tenant_id uuid, p_url text, p_event_prefixes text[])
returns table (id uuid, secret text)
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_secret text;
  v_id uuid;
begin
  if not public.edospmis_has_permission(p_tenant_id, 'admin.webhooks.manage') then
    raise exception 'You do not have permission to manage webhooks.';
  end if;
  if p_url !~ '^https://' then
    raise exception 'The endpoint must be an https:// URL.';
  end if;

  v_secret := encode(gen_random_bytes(24), 'hex');

  insert into public.edospmis_webhooks (tenant_id, url, secret, event_prefixes, created_by)
  values (p_tenant_id, p_url, v_secret, coalesce(p_event_prefixes, '{}'), auth.uid())
  returning public.edospmis_webhooks.id into v_id;

  insert into public.edospmis_audit_logs (tenant_id, actor_id, action, entity_type, entity_id, after)
  values (p_tenant_id, auth.uid(), 'webhook.created', 'webhook', v_id, jsonb_build_object('url', p_url, 'event_prefixes', p_event_prefixes));

  return query select v_id, v_secret;
end;
$$;

create or replace function public.edospmis_set_webhook_active(p_webhook_id uuid, p_is_active boolean)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_webhook record;
begin
  select * into v_webhook from public.edospmis_webhooks where id = p_webhook_id;
  if v_webhook is null then
    raise exception 'That webhook could not be found.';
  end if;
  if not public.edospmis_has_permission(v_webhook.tenant_id, 'admin.webhooks.manage') then
    raise exception 'You do not have permission to manage webhooks.';
  end if;

  update public.edospmis_webhooks set is_active = p_is_active where id = p_webhook_id;
end;
$$;

create or replace function public.edospmis_delete_webhook(p_webhook_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_webhook record;
begin
  select * into v_webhook from public.edospmis_webhooks where id = p_webhook_id;
  if v_webhook is null then
    raise exception 'That webhook could not be found.';
  end if;
  if not public.edospmis_has_permission(v_webhook.tenant_id, 'admin.webhooks.manage') then
    raise exception 'You do not have permission to manage webhooks.';
  end if;

  delete from public.edospmis_webhooks where id = p_webhook_id;
end;
$$;

-- ── Dispatch: fires on every audit log entry, tenant-wide, for free ──────

create or replace function public.edospmis_dispatch_webhooks()
returns trigger
language plpgsql
security definer
set search_path = public, auth, extensions, net
as $$
declare
  v_hook record;
  v_payload jsonb;
  v_signature text;
  v_request_id bigint;
  v_matches boolean;
begin
  for v_hook in
    select * from public.edospmis_webhooks
    where tenant_id = new.tenant_id and is_active
  loop
    v_matches := array_length(v_hook.event_prefixes, 1) is null;
    if not v_matches then
      v_matches := exists (select 1 from unnest(v_hook.event_prefixes) p where new.action like p || '%');
    end if;
    if not v_matches then
      continue;
    end if;

    v_payload := jsonb_build_object(
      'event', new.action,
      'entity_type', new.entity_type,
      'entity_id', new.entity_id,
      'tenant_id', new.tenant_id,
      'occurred_at', new.created_at,
      'data', new.after
    );

    -- A webhook this tenant misconfigured (bad host, timeout, TLS error)
    -- must never take down the transaction that produced this audit row.
    begin
      v_signature := encode(extensions.hmac(v_payload::text, v_hook.secret, 'sha256'), 'hex');
      v_request_id := net.http_post(
        url := v_hook.url,
        body := v_payload,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'X-EDOSPMIS-Event', new.action,
          'X-EDOSPMIS-Signature', 'sha256=' || v_signature
        ),
        timeout_milliseconds := 8000
      );

      insert into public.edospmis_webhook_deliveries (webhook_id, tenant_id, event, payload, request_id)
      values (v_hook.id, new.tenant_id, new.action, v_payload, v_request_id);
    exception when others then
      insert into public.edospmis_webhook_deliveries (webhook_id, tenant_id, event, payload, response_body)
      values (v_hook.id, new.tenant_id, new.action, v_payload, 'Dispatch failed: ' || sqlerrm);
    end;
  end loop;

  return new;
end;
$$;

create trigger edospmis_dispatch_webhooks_trg
after insert on public.edospmis_audit_logs
for each row execute function public.edospmis_dispatch_webhooks();

-- ── Check a delivery's outcome on demand ─────────────────────────────────

create or replace function public.edospmis_check_webhook_delivery(p_delivery_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth, net
as $$
declare
  v_delivery record;
  v_response record;
begin
  select d.*, w.tenant_id as webhook_tenant_id into v_delivery
  from public.edospmis_webhook_deliveries d
  join public.edospmis_webhooks w on w.id = d.webhook_id
  where d.id = p_delivery_id;
  if v_delivery is null then
    raise exception 'That delivery could not be found.';
  end if;
  if not public.edospmis_has_permission(v_delivery.webhook_tenant_id, 'admin.webhooks.manage') then
    raise exception 'You do not have permission to view webhook deliveries.';
  end if;
  if v_delivery.request_id is null then
    raise exception 'This delivery was never sent.';
  end if;

  select * into v_response from net._http_response where id = v_delivery.request_id;

  update public.edospmis_webhook_deliveries
  set response_status = v_response.status_code,
      response_body = coalesce(left(v_response.content, 2000), v_response.error_msg),
      checked_at = now()
  where id = p_delivery_id;
end;
$$;

-- ── New tenant provisioning gets the permission granted to its admin
--    automatically (Tenant Administrator holds every permission already);
--    no role's default grant list needs editing for a brand-new key that
--    no seeded non-admin role should hold by default.
