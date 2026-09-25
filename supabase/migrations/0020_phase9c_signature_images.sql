-- Phase 9c — Visual signature capture (drawn or uploaded), for both the
-- tenant countersigner and external parties, on top of the typed-name
-- attestation from 0018. The typed name/title/consent/IP remain the
-- evidentiary record; the image is what actually renders on the PDF.

alter table public.edospmis_contract_parties add column signature_image text;

drop function if exists public.edospmis_record_contract_signature(uuid, text, text, boolean);

create or replace function public.edospmis_record_contract_signature(
  p_party_id uuid,
  p_signed_name text,
  p_signed_title text default null,
  p_consented boolean default false,
  p_signature_image text default null
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
      signed_title = nullif(trim(coalesce(p_signed_title, '')), ''), consented_electronic = true,
      signature_image = p_signature_image
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

drop function if exists public.edospmis_submit_external_signature(text, text, text, boolean, text, text);

create or replace function public.edospmis_submit_external_signature(
  p_token text,
  p_signed_name text,
  p_signed_title text,
  p_consented boolean,
  p_ip text,
  p_user_agent text,
  p_signature_image text default null
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
      ip_address = p_ip, user_agent = p_user_agent, signature_image = p_signature_image
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

revoke all on function public.edospmis_submit_external_signature(text, text, text, boolean, text, text, text) from public;
grant execute on function public.edospmis_submit_external_signature(text, text, text, boolean, text, text, text) to service_role;
