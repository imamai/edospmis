-- Phase 9d — A user's own signature, saved once under Settings and reused
-- automatically every time they countersign a contract. Personal, not
-- tenant-scoped (edospmis_users is the cross-tenant profile table already),
-- consistent with a signature belonging to the person, not the company.
-- edospmis_users_update_self (0001) already lets a user update their own
-- row, so no new RLS policy or RPC is needed here.

alter table public.edospmis_users add column signature_image text;
