-- Phase 9f — Corrects 0022: PostgreSQL grants EXECUTE on every new
-- function to the PUBLIC pseudo-role by default, on top of Supabase's own
-- separate default-privilege grants to anon/authenticated/service_role by
-- name. 0022 revoked anon's own direct grant but left the PUBLIC grant in
-- place, and has_function_privilege(role, ...) returns true if EITHER the
-- role's own grant OR PUBLIC's grant allows it — so anon could still
-- execute every business RPC via the PUBLIC path, unchanged. This revokes
-- PUBLIC's default EXECUTE too, while leaving authenticated's own direct
-- grant (from Supabase's default privileges) untouched.

do $$
declare
  r record;
begin
  for r in
    select p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname like 'edospmis_%'
      and p.proname not in ('edospmis_is_member', 'edospmis_has_permission')
  loop
    execute format('revoke execute on function public.%I(%s) from public', r.proname, r.args);
  end loop;
end $$;
