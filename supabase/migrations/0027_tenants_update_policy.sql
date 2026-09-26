-- Phase 10b — edospmis_tenants has always had a SELECT policy but no
-- UPDATE policy at all, so nobody (not even a Tenant Administrator) could
-- rename their workspace or set branding through the app; every such save
-- would silently affect 0 rows under RLS. This is what the new
-- "Organization Profile" settings page needs to actually persist.

create policy edospmis_tenants_update on public.edospmis_tenants
  for update
  using (edospmis_has_permission(id, 'admin.org.manage'))
  with check (edospmis_has_permission(id, 'admin.org.manage'));
