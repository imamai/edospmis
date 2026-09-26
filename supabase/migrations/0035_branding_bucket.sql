-- Real logo upload (was a plain "Logo URL" text field) — a public bucket
-- since lib/export/document.ts's fetchLogoDataUrl() does a plain
-- unauthenticated fetch(url) when building a PO/invoice/contract PDF; logos
-- aren't sensitive data. Writes stay tenant-scoped through RLS.

insert into storage.buckets (id, name, public)
  values ('edospmis-branding', 'edospmis-branding', true)
  on conflict (id) do nothing;

create policy edospmis_branding_storage_insert on storage.objects for insert
  with check (bucket_id = 'edospmis-branding' and public.edospmis_is_member((storage.foldername(name))[1]::uuid));
create policy edospmis_branding_storage_update on storage.objects for update
  using (bucket_id = 'edospmis-branding' and public.edospmis_is_member((storage.foldername(name))[1]::uuid));
create policy edospmis_branding_storage_delete on storage.objects for delete
  using (bucket_id = 'edospmis-branding' and public.edospmis_has_permission((storage.foldername(name))[1]::uuid, 'admin.org.manage'));
