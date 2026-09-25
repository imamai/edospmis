-- Phase 9b — Supplier sourcing: token-based public quote intake, for both
-- suppliers already on file and brand-new prospects being sourced for the
-- first time. Same architecture as 0018's contract e-signature (tokenized
-- link + service_role-only SECURITY DEFINER RPCs for the anonymous side),
-- applied to RFQs, and reusing 0018's edospmis_generate_signing_token().
--
-- A prospect (no supplier_id yet) is identified by invite_name/email/phone
-- on the invite row; on submission they either match an existing supplier
-- by email or get a new supplier row created with is_active = false — the
-- same toggle Settings > Suppliers already uses, so staff review and
-- activate them there like any other supplier, no new concept needed.

alter table public.edospmis_rfq_suppliers alter column supplier_id drop not null;
alter table public.edospmis_rfq_suppliers
  add column invite_name text,
  add column invite_email text,
  add column invite_phone text,
  add column access_token text not null default public.edospmis_generate_signing_token(),
  add column token_expires_at timestamptz not null default (now() + interval '30 days'),
  add column status text not null default 'invited' check (status in ('invited', 'viewed', 'submitted', 'declined')),
  add column viewed_at timestamptz,
  add column responded_at timestamptz,
  add constraint edospmis_rfq_suppliers_identity check (supplier_id is not null or invite_name is not null);

create unique index edospmis_rfq_suppliers_token_idx on public.edospmis_rfq_suppliers (access_token);

alter table public.edospmis_quotations
  add column submitted_via text not null default 'staff' check (submitted_via in ('staff', 'supplier_portal')),
  add column line_prices jsonb;

-- ── Public, token-authenticated read + submit ──────────────────────────────
-- Granted to service_role only: called from a server route holding the
-- service-role key (src/lib/supabase/admin.ts), never a browser session.

create or replace function public.edospmis_get_rfq_by_token(p_token text)
returns table (
  rfq_id uuid,
  tenant_name text,
  rfq_title text,
  items jsonb,
  closing_date date,
  rfq_status text,
  invite_id uuid,
  supplier_display_name text,
  invite_status text,
  token_expired boolean
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_invite record;
  v_rfq record;
  v_expired boolean;
begin
  select * into v_invite from public.edospmis_rfq_suppliers where access_token = p_token;
  if v_invite is null then
    raise exception 'This link is invalid or has expired.';
  end if;
  select * into v_rfq from public.edospmis_rfqs where id = v_invite.rfq_id;

  v_expired := v_invite.token_expires_at < now();

  if not v_expired and v_invite.status = 'invited' then
    update public.edospmis_rfq_suppliers set status = 'viewed', viewed_at = now() where id = v_invite.id;
    v_invite.status := 'viewed';
  end if;

  return query
    select
      v_rfq.id,
      (select name from public.edospmis_tenants where id = v_rfq.tenant_id),
      v_rfq.title,
      v_rfq.items,
      v_rfq.closing_date,
      v_rfq.status,
      v_invite.id,
      coalesce(v_invite.invite_name, (select s.name from public.edospmis_suppliers s where s.id = v_invite.supplier_id)),
      v_invite.status,
      v_expired;
end;
$$;

create or replace function public.edospmis_submit_quotation_by_token(
  p_token text,
  p_line_prices jsonb,
  p_notes text,
  p_supplier_name text,
  p_supplier_email text,
  p_supplier_phone text
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_invite record;
  v_rfq record;
  v_supplier_id uuid;
  v_total_cents bigint;
begin
  select * into v_invite from public.edospmis_rfq_suppliers where access_token = p_token;
  if v_invite is null then
    raise exception 'This link is invalid or has expired.';
  end if;
  if v_invite.token_expires_at < now() then
    raise exception 'This link has expired — ask for a new one.';
  end if;
  if v_invite.status = 'submitted' then
    raise exception 'A quotation has already been submitted for this invitation.';
  end if;
  if v_invite.status = 'declined' then
    raise exception 'This invitation was already declined.';
  end if;

  select * into v_rfq from public.edospmis_rfqs where id = v_invite.rfq_id;
  if v_rfq.status <> 'open' then
    raise exception 'This request for quotation is no longer open.';
  end if;

  select coalesce(sum((elem->>'qty')::numeric * (elem->>'unit_price_cents')::numeric), 0)::bigint
  into v_total_cents
  from jsonb_array_elements(p_line_prices) elem;
  if v_total_cents <= 0 then
    raise exception 'Enter at least one price.';
  end if;

  v_supplier_id := v_invite.supplier_id;
  if v_supplier_id is null then
    if coalesce(trim(p_supplier_name), '') = '' then
      raise exception 'Enter your company name.';
    end if;
    if p_supplier_email is not null and trim(p_supplier_email) <> '' then
      select s.id into v_supplier_id from public.edospmis_suppliers s
      where s.tenant_id = v_rfq.tenant_id and lower(s.email) = lower(trim(p_supplier_email))
      limit 1;
    end if;
    if v_supplier_id is null then
      insert into public.edospmis_suppliers (tenant_id, name, email, phone, is_active)
      values (
        v_rfq.tenant_id, trim(p_supplier_name),
        nullif(trim(coalesce(p_supplier_email, '')), ''), nullif(trim(coalesce(p_supplier_phone, '')), ''),
        false
      )
      returning id into v_supplier_id;
    end if;
    update public.edospmis_rfq_suppliers set supplier_id = v_supplier_id where id = v_invite.id;
  end if;

  insert into public.edospmis_quotations (tenant_id, rfq_id, supplier_id, total_cents, notes, line_prices, submitted_via)
  values (
    v_rfq.tenant_id, v_rfq.id, v_supplier_id, v_total_cents,
    nullif(trim(coalesce(p_notes, '')), ''), p_line_prices, 'supplier_portal'
  );

  update public.edospmis_rfq_suppliers set status = 'submitted', responded_at = now() where id = v_invite.id;
end;
$$;

create or replace function public.edospmis_decline_quotation_invite(p_token text, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_invite record;
begin
  select * into v_invite from public.edospmis_rfq_suppliers where access_token = p_token;
  if v_invite is null then
    raise exception 'This link is invalid or has expired.';
  end if;
  if v_invite.status in ('submitted', 'declined') then
    raise exception 'This invitation has already been responded to.';
  end if;

  update public.edospmis_rfq_suppliers
  set status = 'declined', responded_at = now()
  where id = v_invite.id;
end;
$$;

revoke all on function public.edospmis_get_rfq_by_token(text) from public;
revoke all on function public.edospmis_submit_quotation_by_token(text, jsonb, text, text, text, text) from public;
revoke all on function public.edospmis_decline_quotation_invite(text, text) from public;
grant execute on function public.edospmis_get_rfq_by_token(text) to service_role;
grant execute on function public.edospmis_submit_quotation_by_token(text, jsonb, text, text, text, text) to service_role;
grant execute on function public.edospmis_decline_quotation_invite(text, text) to service_role;
