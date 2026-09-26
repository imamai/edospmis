-- Phase 10a — Platform admin: a small, deliberately hard-to-escalate-into
-- allow-list for the handful of people who operate EDOSPMIS itself (as
-- opposed to any one tenant). edospmis_users already has a self-update RLS
-- policy that lets a user change any column on their own row, so a plain
-- boolean column there would let anyone self-promote via a raw API call.
-- A dedicated table with no insert/update/delete policy for any client role
-- sidesteps that: it can only ever be written by a migration or the
-- service-role key, never through the anon/authenticated REST API.

create table public.edospmis_platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  granted_at timestamptz not null default now()
);

alter table public.edospmis_platform_admins enable row level security;

create policy edospmis_platform_admins_select on public.edospmis_platform_admins
  for select using (user_id = (select auth.uid()));

create function public.edospmis_is_platform_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from public.edospmis_platform_admins where user_id = auth.uid());
$$;

-- Left at Postgres's default PUBLIC execute grant, same as
-- edospmis_is_member/edospmis_has_permission (see 0022/0023's revoke
-- sweeps, which deliberately excluded those two): harmless for anon since
-- auth.uid() is null there, and required for authenticated since this is
-- called from inside an RLS policy below.

alter policy edospmis_tenants_select on public.edospmis_tenants
  using (edospmis_is_member(id) or edospmis_is_platform_admin());

insert into public.edospmis_platform_admins (user_id)
values ('0c174e49-2816-4c53-8879-1c6a16788ff6')
on conflict do nothing;
