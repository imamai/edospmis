-- Phase 9a — Contract templates + real e-signature, per ARCHITECTURE.md
-- §4.6's own documented plan and its explicitly-stated "next increment"
-- (0006's header: "Signing order is NOT enforced yet... that matters once
-- signing actually happens through the platform's own links, which is the
-- next increment"). This is that increment:
--   - edospmis_contract_templates: a reusable starting draft (any tenant,
--     any goods/services type) — deliberately still plain text, not a
--     merge-field engine, matching 0006's "cheap first cut" philosophy.
--   - edospmis_contract_parties gains signing_order, consented_electronic,
--     a single-use access_token, and the in-house attestation fields
--     (typed name, title, IP, user agent) — the "build" tier §4.6 calls
--     for before a real e-signature *provider* is ever bought.
--   - edospmis_contract_events: the client-visible timeline, separate from
--     edospmis_audit_logs, exactly as §1.2 specifies.
--   - The tenant's own countersignature now happens for real, in-app,
--     before a contract can be sent — "pre-signed" in the sense the
--     product actually means it: the company's side is done before the
--     external party ever sees the document.
--   - External signing happens only through edospmis_get_contract_by_token
--     / edospmis_submit_external_signature / edospmis_decline_external_
--     signature — all granted to service_role only, never to
--     authenticated/anon, because the caller here is a server route
--     holding the service-role key (src/lib/supabase/admin.ts), not a
--     logged-in Supabase Auth session. The token itself is what the
--     signer is trusted by, per §4.6's design.

alter table public.edospmis_contract_parties
  add column phone text,
  add column signing_order int not null default 1,
  add column consented_electronic boolean not null default false,
  add column access_token text,
  add column token_expires_at timestamptz,
  add column signed_name text,
  add column signed_title text,
  add column ip_address text,
  add column user_agent text,
  add column viewed_at timestamptz,
  add column declined_at timestamptz,
  add column decline_reason text;

alter table public.edospmis_contract_parties drop constraint edospmis_contract_parties_status_check;
alter table public.edospmis_contract_parties
  add constraint edospmis_contract_parties_status_check check (status in ('pending', 'viewed', 'signed', 'declined'));

create unique index edospmis_contract_parties_token_idx on public.edospmis_contract_parties (access_token) where access_token is not null;

-- ── Templates ─────────────────────────────────────────────────────────────

create table public.edospmis_contract_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.edospmis_tenants (id) on delete cascade,
  name text not null,
  contract_type text not null default 'service_agreement',
  body_template text not null default '',
  is_active boolean not null default true,
  created_by uuid references public.edospmis_users (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.edospmis_contracts add column template_id uuid references public.edospmis_contract_templates (id) on delete set null;

alter table public.edospmis_contract_templates enable row level security;

create policy edospmis_contract_templates_select on public.edospmis_contract_templates
  for select using (tenant_id is null or public.edospmis_is_member(tenant_id));
create policy edospmis_contract_templates_insert on public.edospmis_contract_templates
  for insert with check (tenant_id is not null and public.edospmis_has_permission(tenant_id, 'legal.contract.create'));
create policy edospmis_contract_templates_update on public.edospmis_contract_templates
  for update using (tenant_id is not null and public.edospmis_has_permission(tenant_id, 'legal.contract.create'))
  with check (tenant_id is not null and public.edospmis_has_permission(tenant_id, 'legal.contract.create'));
create policy edospmis_contract_templates_delete on public.edospmis_contract_templates
  for delete using (tenant_id is not null and public.edospmis_has_permission(tenant_id, 'legal.contract.create'));

-- A platform-wide starting template every tenant can see and clone from,
-- genericised from a real supplier-supply agreement (tenant_id null = the
-- shared library, not any one tenant's private draft).
insert into public.edospmis_contract_templates (tenant_id, name, contract_type, body_template) values (
  null,
  'Supplier supply agreement',
  'service_agreement',
  'SUPPLIER SUPPLY AGREEMENT

Contract Reference: {{company.name}}/SUP/________/{{year}}
Effective Date: ____________________

PARTIES
1. {{company.name}}, hereinafter referred to as the "Company"; and
2. Supplier: ________________________________________________, of Address:
________________________________________________, hereinafter referred to as the "Supplier".
The Company and the Supplier are collectively referred to as the "Parties".

1. PURPOSE AND SCOPE
The Supplier agrees to supply the goods, materials, equipment and/or services specified in purchase orders, quotations or schedules issued or approved by the Company. Each approved purchase order or schedule shall form part of this Agreement.

2. GOODS / SERVICES
[List each item, specification/unit, quantity and price here — or reference the attached purchase order/quotation.]

3. PRICING AND PAYMENT
Prices shall be as stated in the approved quotation or purchase order. Unless otherwise agreed in writing, the Supplier shall issue a valid invoice after delivery and acceptance. Payment shall be made within ________ days of receipt of a complete and accurate invoice and all required supporting documents. Applicable taxes shall be handled in accordance with law.

4. DELIVERY AND ACCEPTANCE
The Supplier shall deliver to the location and within the timelines stated in the purchase order. The Company may inspect delivered goods or services and may reject items that do not conform to the agreed specifications, quantity, quality or condition. Rejected items shall be replaced or corrected by the Supplier at no additional cost.

5. QUALITY, WARRANTY AND DEFECTS
The Supplier warrants that all goods and services supplied shall conform to the agreed specifications and be fit for their stated purpose. The Supplier shall promptly remedy defects attributable to the Supplier during the applicable warranty period or, where no period is stated, within a reasonable period after notification.

6. DOCUMENTATION
Where applicable, the Supplier shall provide delivery notes, invoices, warranties, certificates, manuals, tax documentation, licences, inspection certificates and any other documents reasonably required by the Company.

7. CONFIDENTIALITY
The Supplier shall keep confidential all non-public business, technical, financial, customer and operational information received from the Company and shall use such information only for performing this Agreement.

8. COMPLIANCE
The Supplier shall comply with applicable laws and regulations and shall maintain all licences, registrations and approvals required for the goods or services supplied. The Supplier shall not offer or provide any improper payment, benefit or inducement to any employee, representative or agent of the Company.

9. SUBCONTRACTING
The Supplier shall not subcontract a material part of its obligations without the Company''s prior written consent. Any approved subcontracting shall not relieve the Supplier of its obligations under this Agreement.

10. TERM AND TERMINATION
This Agreement shall commence on the Effective Date and remain in force until terminated or replaced. Either Party may terminate the Agreement by giving ______ days'' written notice. The Company may terminate immediately where the Supplier materially breaches the Agreement, becomes insolvent, engages in fraud or serious misconduct, or repeatedly fails to meet agreed delivery or quality requirements.

11. LIABILITY
Each Party shall be responsible for losses or damage caused by its breach of this Agreement, negligence, wilful misconduct or unlawful acts, subject to applicable law and any agreed limitations in a purchase order.

12. FORCE MAJEURE
Neither Party shall be liable for delay caused by events beyond its reasonable control, provided that the affected Party promptly notifies the other Party and takes reasonable steps to mitigate the effects.

13. DISPUTE RESOLUTION AND GOVERNING LAW
The Parties shall first attempt to resolve any dispute through good-faith negotiations. If unresolved, the dispute may be referred to a competent court or other dispute-resolution forum agreed by the Parties.

14. GENERAL
Any amendment to this Agreement must be in writing and approved by the Parties. A purchase order, quotation or schedule that expressly forms part of this Agreement shall be read together with it. If there is a conflict, the specific written purchase order shall prevail for the relevant transaction unless otherwise stated.'
);

-- ── Client-visible timeline (separate from the tenant-internal audit log) ──

create table public.edospmis_contract_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.edospmis_tenants (id) on delete cascade,
  contract_id uuid not null references public.edospmis_contracts (id) on delete cascade,
  event_type text not null,
  actor_type text not null check (actor_type in ('staff', 'client', 'witness', 'system')),
  actor_label text,
  occurred_at timestamptz not null default now()
);

create index edospmis_contract_events_contract_idx on public.edospmis_contract_events (contract_id, occurred_at);

alter table public.edospmis_contract_events enable row level security;
create policy edospmis_contract_events_select on public.edospmis_contract_events
  for select using (public.edospmis_is_member(tenant_id));
-- No write policy: only the security-definer functions below (and the
-- existing edospmis_send_contract/void) write here.

-- ── Token helper ──────────────────────────────────────────────────────────

create or replace function public.edospmis_generate_signing_token()
returns text
language sql
volatile
as $$
  select translate(rtrim(encode(extensions.gen_random_bytes(24), 'base64'), '='), '+/', '-_');
$$;

-- ── Send: now also gates on the tenant's own pre-signature, and issues a
--    single-use link for every external party ─────────────────────────────

create or replace function public.edospmis_send_contract(p_contract_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_contract record;
  v_unsigned_countersigner boolean;
begin
  select * into v_contract from public.edospmis_contracts where id = p_contract_id;
  if v_contract is null then
    raise exception 'That contract could not be found.';
  end if;
  if not public.edospmis_has_permission(v_contract.tenant_id, 'legal.contract.send') then
    raise exception 'You do not have permission to send contracts.';
  end if;
  if v_contract.status <> 'draft' then
    raise exception 'This contract has already been sent.';
  end if;
  if not exists (select 1 from public.edospmis_contract_parties where contract_id = p_contract_id) then
    raise exception 'Add at least one signing party before sending.';
  end if;

  select exists (
    select 1 from public.edospmis_contract_parties
    where contract_id = p_contract_id and party_role = 'tenant_signer' and status <> 'signed'
  ) into v_unsigned_countersigner;
  if v_unsigned_countersigner then
    raise exception 'Sign as the countersigner before sending this contract out.';
  end if;

  update public.edospmis_contract_parties
  set access_token = public.edospmis_generate_signing_token(), token_expires_at = now() + interval '30 days'
  where contract_id = p_contract_id and party_role <> 'tenant_signer' and access_token is null;

  update public.edospmis_contracts set status = 'sent', sent_at = now() where id = p_contract_id;

  insert into public.edospmis_contract_events (tenant_id, contract_id, event_type, actor_type)
  values (v_contract.tenant_id, p_contract_id, 'sent', 'staff');

  insert into public.edospmis_audit_logs (tenant_id, actor_id, action, entity_type, entity_id)
  values (v_contract.tenant_id, auth.uid(), 'contract.sent', 'contract', p_contract_id);
end;
$$;

-- ── Tenant countersignature: real capture, in-app, before sending ─────────
-- Arity changes from the old (p_party_id uuid) signature, so the old
-- function must be dropped first or both overloads would coexist.

drop function if exists public.edospmis_record_contract_signature(uuid);

create or replace function public.edospmis_record_contract_signature(
  p_party_id uuid,
  p_signed_name text,
  p_signed_title text default null,
  p_consented boolean default false
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_party record;
  v_contract record;
  v_remaining int;
begin
  select * into v_party from public.edospmis_contract_parties where id = p_party_id;
  if v_party is null then
    raise exception 'That signing party could not be found.';
  end if;
  if v_party.party_role <> 'tenant_signer' then
    raise exception 'Only the countersigner signs here — other parties sign through their own secure link.';
  end if;
  if not public.edospmis_has_permission(v_party.tenant_id, 'legal.contract.send') then
    raise exception 'You do not have permission to sign contracts.';
  end if;
  if not p_consented then
    raise exception 'Confirm you agree to sign this electronically before continuing.';
  end if;
  if coalesce(trim(p_signed_name), '') = '' then
    raise exception 'Enter your full name.';
  end if;

  select * into v_contract from public.edospmis_contracts where id = v_party.contract_id;
  if v_contract.status not in ('draft', 'sent') then
    raise exception 'This contract is not awaiting signatures.';
  end if;
  if v_party.status = 'signed' then
    raise exception 'You have already signed this contract.';
  end if;
  if exists (
    select 1 from public.edospmis_contract_parties cp
    where cp.contract_id = v_party.contract_id and cp.signing_order < v_party.signing_order and cp.status <> 'signed'
  ) then
    raise exception 'Earlier signers must sign before the countersigner.';
  end if;

  update public.edospmis_contract_parties
  set status = 'signed', signed_at = now(), signed_name = trim(p_signed_name),
      signed_title = nullif(trim(coalesce(p_signed_title, '')), ''), consented_electronic = true
  where id = p_party_id;

  select count(*) into v_remaining
  from public.edospmis_contract_parties
  where contract_id = v_party.contract_id and status <> 'signed';
  if v_remaining = 0 then
    update public.edospmis_contracts set status = 'signed', signed_at = now() where id = v_party.contract_id;
  end if;

  insert into public.edospmis_contract_events (tenant_id, contract_id, event_type, actor_type, actor_label)
  values (v_party.tenant_id, v_party.contract_id, 'signed', 'staff', trim(p_signed_name));

  insert into public.edospmis_audit_logs (tenant_id, actor_id, action, entity_type, entity_id, after)
  values (v_party.tenant_id, auth.uid(), 'contract.party_signed', 'contract_party', p_party_id,
          jsonb_build_object('contract_id', v_party.contract_id, 'party_role', v_party.party_role));
end;
$$;

-- ── External, token-authenticated signing — no platform account needed ────
-- Granted to service_role only: the caller is always a server route holding
-- the service-role key (src/lib/supabase/admin.ts), never a browser session.

create or replace function public.edospmis_get_contract_by_token(p_token text)
returns table (
  contract_id uuid,
  tenant_name text,
  contract_title text,
  contract_type text,
  contract_status text,
  body text,
  requires_witness boolean,
  party_id uuid,
  party_role text,
  party_name text,
  party_status text,
  party_signing_order int,
  can_sign_now boolean,
  token_expired boolean,
  signed_at timestamptz,
  other_parties jsonb
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_party record;
  v_contract record;
  v_expired boolean;
  v_can_sign boolean;
begin
  select * into v_party from public.edospmis_contract_parties where access_token = p_token;
  if v_party is null then
    raise exception 'This link is invalid or has expired.';
  end if;
  select * into v_contract from public.edospmis_contracts where id = v_party.contract_id;

  v_expired := v_party.token_expires_at is not null and v_party.token_expires_at < now();

  if not v_expired and v_party.status = 'pending' then
    update public.edospmis_contract_parties set status = 'viewed', viewed_at = now() where id = v_party.id;
    insert into public.edospmis_contract_events (tenant_id, contract_id, event_type, actor_type, actor_label)
    values (v_party.tenant_id, v_party.contract_id, 'viewed', case when v_party.party_role = 'witness' then 'witness' else 'client' end, v_party.name);
    v_party.status := 'viewed';
  end if;

  v_can_sign := (not v_expired) and v_party.status in ('pending', 'viewed') and not exists (
    select 1 from public.edospmis_contract_parties cp
    where cp.contract_id = v_party.contract_id and cp.signing_order < v_party.signing_order and cp.status <> 'signed'
  );

  return query
    select
      v_contract.id, (select name from public.edospmis_tenants where id = v_contract.tenant_id), v_contract.title,
      v_contract.contract_type, v_contract.status, v_contract.body, v_contract.requires_witness,
      v_party.id, v_party.party_role, v_party.name, v_party.status, v_party.signing_order,
      v_can_sign, v_expired, v_party.signed_at,
      (select jsonb_agg(jsonb_build_object('role', cp.party_role, 'name', cp.name, 'status', cp.status, 'signed_at', cp.signed_at) order by cp.signing_order)
       from public.edospmis_contract_parties cp where cp.contract_id = v_contract.id);
end;
$$;

create or replace function public.edospmis_submit_external_signature(
  p_token text,
  p_signed_name text,
  p_signed_title text,
  p_consented boolean,
  p_ip text,
  p_user_agent text
)
returns text
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_party record;
  v_remaining int;
  v_final_status text;
begin
  select * into v_party from public.edospmis_contract_parties where access_token = p_token;
  if v_party is null then
    raise exception 'This link is invalid or has expired.';
  end if;
  if v_party.token_expires_at is not null and v_party.token_expires_at < now() then
    raise exception 'This link has expired — ask for a new one.';
  end if;
  if v_party.status = 'signed' then
    raise exception 'You have already signed this contract.';
  end if;
  if v_party.status = 'declined' then
    raise exception 'This signature was already declined — contact the sender for a new link.';
  end if;
  if exists (
    select 1 from public.edospmis_contract_parties cp
    where cp.contract_id = v_party.contract_id and cp.signing_order < v_party.signing_order and cp.status <> 'signed'
  ) then
    raise exception 'Earlier signers have not completed their signature yet.';
  end if;
  if not p_consented then
    raise exception 'You must confirm you agree to sign this electronically.';
  end if;
  if coalesce(trim(p_signed_name), '') = '' then
    raise exception 'Enter your full name.';
  end if;

  update public.edospmis_contract_parties
  set status = 'signed', signed_at = now(), signed_name = trim(p_signed_name),
      signed_title = nullif(trim(coalesce(p_signed_title, '')), ''), consented_electronic = true,
      ip_address = p_ip, user_agent = p_user_agent
  where id = v_party.id;

  insert into public.edospmis_contract_events (tenant_id, contract_id, event_type, actor_type, actor_label)
  values (v_party.tenant_id, v_party.contract_id, 'signed', case when v_party.party_role = 'witness' then 'witness' else 'client' end, trim(p_signed_name));

  select count(*) into v_remaining
  from public.edospmis_contract_parties
  where contract_id = v_party.contract_id and status <> 'signed';

  if v_remaining = 0 then
    update public.edospmis_contracts set status = 'signed', signed_at = now() where id = v_party.contract_id;
    insert into public.edospmis_contract_events (tenant_id, contract_id, event_type, actor_type, actor_label)
    values (v_party.tenant_id, v_party.contract_id, 'executed', 'system', 'All parties signed');
    v_final_status := 'signed';
  else
    v_final_status := 'sent';
  end if;

  return v_final_status;
end;
$$;

create or replace function public.edospmis_decline_external_signature(p_token text, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_party record;
begin
  select * into v_party from public.edospmis_contract_parties where access_token = p_token;
  if v_party is null then
    raise exception 'This link is invalid or has expired.';
  end if;
  if v_party.status in ('signed', 'declined') then
    raise exception 'This signature has already been recorded.';
  end if;

  update public.edospmis_contract_parties
  set status = 'declined', declined_at = now(), decline_reason = nullif(trim(coalesce(p_reason, '')), '')
  where id = v_party.id;

  insert into public.edospmis_contract_events (tenant_id, contract_id, event_type, actor_type, actor_label)
  values (v_party.tenant_id, v_party.contract_id, 'declined', case when v_party.party_role = 'witness' then 'witness' else 'client' end, v_party.name);
end;
$$;

revoke all on function public.edospmis_get_contract_by_token(text) from public;
revoke all on function public.edospmis_submit_external_signature(text, text, text, boolean, text, text) from public;
revoke all on function public.edospmis_decline_external_signature(text, text) from public;
grant execute on function public.edospmis_get_contract_by_token(text) to service_role;
grant execute on function public.edospmis_submit_external_signature(text, text, text, boolean, text, text) to service_role;
grant execute on function public.edospmis_decline_external_signature(text, text) to service_role;
