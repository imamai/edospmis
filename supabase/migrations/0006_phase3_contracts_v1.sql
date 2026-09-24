-- EDOSPMIS Phase 3b — Legal / Contract Provisioning, v1 cut.
--
-- ARCHITECTURE.md §4.6 already designed the full model: templates,
-- versioned + hashed tenant-branded PDFs, secure single-use signing links
-- so a client or witness never needs a platform account, enforced signing
-- order. Building all of that (real PDF rendering, token-authenticated
-- public signing pages, email delivery) is a substantial, separate piece
-- of engineering — comparable in size to this same migration's sibling,
-- Procurement. This v1 proves the core loop instead:
--   - No templates yet — a lawyer drafts the contract body as plain text.
--   - No PDF rendering/branding/hashing/versioning yet — the body lives
--     directly on the contract row and is editable while status='draft'.
--   - No secure external signing link yet — a party's signature is
--     recorded manually by staff (e.g. the client signed on paper, or via
--     a general-purpose e-sign tool outside this platform, and someone
--     logs it here), the same "staff records what came back externally"
--     pattern already used for procurement quotations in 0005.
--   - Signing order is NOT enforced yet (no signing_order column) — for a
--     manually-recorded signature there is no real system-level ordering
--     to violate; that constraint matters once signing actually happens
--     through the platform's own links, which is the next increment.
-- None of this contradicts §4.6 — it's the honest first slice of it.

create table public.edospmis_contracts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.edospmis_tenants (id) on delete cascade,
  case_id uuid references public.edospmis_cases (id) on delete set null,
  client_id uuid references public.edospmis_clients (id) on delete set null,
  contract_type text not null default 'service_agreement',
  title text not null,
  body text not null default '',
  requires_witness boolean not null default false,
  status text not null default 'draft' check (status in ('draft', 'sent', 'signed', 'void')),
  voided_reason text,
  created_by uuid references public.edospmis_users (id) on delete set null,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  signed_at timestamptz
);

create table public.edospmis_contract_parties (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.edospmis_tenants (id) on delete cascade,
  contract_id uuid not null references public.edospmis_contracts (id) on delete cascade,
  party_role text not null check (party_role in ('client_signer', 'tenant_signer', 'witness')),
  name text not null,
  email text,
  status text not null default 'pending' check (status in ('pending', 'signed')),
  signed_at timestamptz,
  created_at timestamptz not null default now()
);

create index edospmis_contracts_case_idx on public.edospmis_contracts (case_id);
create index edospmis_contract_parties_contract_idx on public.edospmis_contract_parties (contract_id);

-- ── RLS ───────────────────────────────────────────────────────────────

alter table public.edospmis_contracts enable row level security;
alter table public.edospmis_contract_parties enable row level security;

create policy edospmis_contracts_select on public.edospmis_contracts
  for select using (public.edospmis_is_member(tenant_id));
create policy edospmis_contracts_insert on public.edospmis_contracts
  for insert with check (public.edospmis_has_permission(tenant_id, 'legal.contract.create'));
create policy edospmis_contracts_update on public.edospmis_contracts
  for update using (public.edospmis_has_permission(tenant_id, 'legal.contract.edit') and status = 'draft')
  with check (public.edospmis_has_permission(tenant_id, 'legal.contract.edit'));
-- Sending, signing and voiding all change status away from a state the
-- update policy above allows editing from, so they run through the
-- security-definer functions below rather than a broader update policy.

create policy edospmis_contract_parties_select on public.edospmis_contract_parties
  for select using (public.edospmis_is_member(tenant_id));
create policy edospmis_contract_parties_write on public.edospmis_contract_parties
  for all using (
    public.edospmis_has_permission(tenant_id, 'legal.contract.edit')
    and exists (select 1 from public.edospmis_contracts c where c.id = contract_id and c.status = 'draft')
  )
  with check (
    public.edospmis_has_permission(tenant_id, 'legal.contract.edit')
    and exists (select 1 from public.edospmis_contracts c where c.id = contract_id and c.status = 'draft')
  );

-- ── Send: locks the draft, marks it awaiting signatures ──────────────────

create or replace function public.edospmis_send_contract(p_contract_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_contract record;
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

  update public.edospmis_contracts set status = 'sent', sent_at = now() where id = p_contract_id;

  insert into public.edospmis_audit_logs (tenant_id, actor_id, action, entity_type, entity_id)
  values (v_contract.tenant_id, auth.uid(), 'contract.sent', 'contract', p_contract_id);
end;
$$;

-- ── Record a signature: staff-logged for this v1 (see header) ───────────

create or replace function public.edospmis_record_contract_signature(p_party_id uuid)
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
  if not public.edospmis_has_permission(v_party.tenant_id, 'legal.contract.send') then
    raise exception 'You do not have permission to record signatures.';
  end if;

  select * into v_contract from public.edospmis_contracts where id = v_party.contract_id;
  if v_contract.status <> 'sent' then
    raise exception 'This contract is not awaiting signatures.';
  end if;
  if v_party.status = 'signed' then
    raise exception 'This party has already signed.';
  end if;

  update public.edospmis_contract_parties set status = 'signed', signed_at = now() where id = p_party_id;

  select count(*) into v_remaining
  from public.edospmis_contract_parties
  where contract_id = v_party.contract_id and status <> 'signed';

  if v_remaining = 0 then
    update public.edospmis_contracts set status = 'signed', signed_at = now() where id = v_party.contract_id;
  end if;

  insert into public.edospmis_audit_logs (tenant_id, actor_id, action, entity_type, entity_id, after)
  values (v_party.tenant_id, auth.uid(), 'contract.party_signed', 'contract_party', p_party_id,
          jsonb_build_object('contract_id', v_party.contract_id, 'party_role', v_party.party_role));
end;
$$;

-- ── Void: stops a contract that will never be completed ─────────────────

create or replace function public.edospmis_void_contract(p_contract_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_contract record;
begin
  select * into v_contract from public.edospmis_contracts where id = p_contract_id;
  if v_contract is null then
    raise exception 'That contract could not be found.';
  end if;
  if not public.edospmis_has_permission(v_contract.tenant_id, 'legal.contract.void') then
    raise exception 'You do not have permission to void contracts.';
  end if;
  if v_contract.status = 'signed' then
    raise exception 'A fully signed contract cannot be voided from here.';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Say why this contract is being voided.';
  end if;

  update public.edospmis_contracts set status = 'void', voided_reason = p_reason where id = p_contract_id;

  insert into public.edospmis_audit_logs (tenant_id, actor_id, action, entity_type, entity_id, reason)
  values (v_contract.tenant_id, auth.uid(), 'contract.voided', 'contract', p_contract_id, p_reason);
end;
$$;
