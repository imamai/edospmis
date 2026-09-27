-- Uploading or replacing a tenant's logo required only membership, while
-- deleting it required admin.org.manage — so any member could overwrite the
-- logo that appears on every purchase order and invoice sent to a supplier,
-- but could not remove it. The server action already checks admin.org.manage;
-- the storage policy was the way around that check.

drop policy if exists edospmis_branding_storage_insert on storage.objects;
create policy edospmis_branding_storage_insert on storage.objects for insert
  with check (
    bucket_id = 'edospmis-branding'
    and public.edospmis_has_permission(((storage.foldername(name))[1])::uuid, 'admin.org.manage')
  );

drop policy if exists edospmis_branding_storage_update on storage.objects;
create policy edospmis_branding_storage_update on storage.objects for update
  using (
    bucket_id = 'edospmis-branding'
    and public.edospmis_has_permission(((storage.foldername(name))[1])::uuid, 'admin.org.manage')
  );
