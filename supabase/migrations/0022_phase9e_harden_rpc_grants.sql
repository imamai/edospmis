-- Phase 9e — Security hardening from Supabase's own advisor scan:
--   1. Every edospmis_* SECURITY DEFINER function was callable by the
--      unauthenticated `anon` role. This app has no anon-facing table
--      access and no anon-facing RPC except the six token-authenticated
--      ones below — Supabase projects grant EXECUTE on every new function
--      to anon/authenticated/service_role by default (not via the PUBLIC
--      pseudo-role, so a plain `revoke ... from public` never touched it,
--      which is why 0018/0019's own token RPCs were still anon-callable
--      despite their explicit revoke). This migration revokes anon
--      explicitly, project-wide, for every edospmis_ function — except
--      edospmis_is_member/edospmis_has_permission, which real RLS policies
--      invoke as the querying role itself and must stay callable by
--      authenticated (anon never legitimately reaches them either way,
--      since every edospmis_ table's RLS already keys off auth.uid()).
--   2. The six token-authenticated RPCs (contract e-signature, RFQ
--      sourcing) are further locked to service_role only — they're meant
--      to be called exclusively from a trusted server route holding the
--      service-role key, never directly by anon or authenticated.
--   3. edospmis_generate_signing_token had a mutable search_path.

create or replace function public.edospmis_generate_signing_token()
returns text
language sql
volatile
set search_path = public, extensions
as $$
  select translate(rtrim(encode(extensions.gen_random_bytes(24), 'base64'), '='), '+/', '-_');
$$;

do $$
declare
  r record;
  is_token_only_rpc boolean;
begin
  for r in
    select p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname like 'edospmis_%'
      and p.proname not in ('edospmis_is_member', 'edospmis_has_permission')
  loop
    execute format('revoke execute on function public.%I(%s) from anon', r.proname, r.args);

    is_token_only_rpc := r.proname in (
      'edospmis_get_contract_by_token',
      'edospmis_submit_external_signature',
      'edospmis_decline_external_signature',
      'edospmis_get_rfq_by_token',
      'edospmis_submit_quotation_by_token',
      'edospmis_decline_quotation_invite'
    );
    if is_token_only_rpc then
      execute format('revoke execute on function public.%I(%s) from authenticated', r.proname, r.args);
    end if;
  end loop;
end $$;
