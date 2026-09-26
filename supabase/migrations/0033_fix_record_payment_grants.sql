-- Fixes a regression from 0032: DROP FUNCTION + CREATE OR REPLACE on
-- edospmis_record_payment (needed to change its arity) reset its grants to
-- Postgres/Supabase defaults, which include EXECUTE for anon and for the
-- PUBLIC pseudo-role — silently undoing 0022/0023's hardening for this one
-- function. Reapplies the same two revokes 0022/0023 already established
-- project-wide, scoped to this function's new 3-arg signature.

revoke execute on function public.edospmis_record_payment(uuid, text, text) from anon;
revoke execute on function public.edospmis_record_payment(uuid, text, text) from public;
