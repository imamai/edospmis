-- ──────────────────────────────────────────────────────────────────────
-- What the requester already has in their hand.
--
-- A request for something unusual is almost always accompanied by evidence
-- the requester has gathered themselves: a supplier's price list, a flyer, a
-- quotation somebody emailed them, a photograph of the failed part. Today
-- none of that can travel with the request. It arrives separately, by email,
-- to whoever the requester thinks approves things — and the approver decides
-- without it, or chases it.
--
-- So the draft takes attachments, and they go forward with it. The approver
-- sees what the requester saw.
--
-- Deliberately *not* a quotation. A price list a requester found is not a
-- quotation and must never be mistaken for one: a quotation is something a
-- supplier submits against an RFQ, with a signature behind it. These are
-- evidence for a decision, nothing more, and the wording throughout says so.
-- ──────────────────────────────────────────────────────────────────────

-- ── The bucket ────────────────────────────────────────────────────────
--
-- Private, unlike the branding bucket. A supplier price list is commercially
-- sensitive and a photograph of a workplace can contain anything; neither
-- belongs behind a guessable public URL. Reads go through a signed URL minted
-- for somebody we have already identified.

insert into storage.buckets (id, name, public)
values ('edospmis-attachments', 'edospmis-attachments', false)
on conflict (id) do nothing;

-- Path is <tenant_id>/<case_id>/<uuid>.<ext>, so the first folder segment is
-- the tenant — the same convention as the branding bucket, and what every
-- policy below keys on.

drop policy if exists edospmis_attachments_storage_select on storage.objects;
create policy edospmis_attachments_storage_select on storage.objects for select
  using (
    bucket_id = 'edospmis-attachments'
    and public.edospmis_is_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists edospmis_attachments_storage_insert on storage.objects;
create policy edospmis_attachments_storage_insert on storage.objects for insert
  with check (
    bucket_id = 'edospmis-attachments'
    and public.edospmis_is_member(((storage.foldername(name))[1])::uuid)
    and public.edospmis_has_permission(((storage.foldername(name))[1])::uuid, 'procurement.pr.create')
  );

drop policy if exists edospmis_attachments_storage_delete on storage.objects;
create policy edospmis_attachments_storage_delete on storage.objects for delete
  using (
    bucket_id = 'edospmis-attachments'
    and public.edospmis_has_permission(((storage.foldername(name))[1])::uuid, 'procurement.pr.edit')
  );

-- ── The record ────────────────────────────────────────────────────────
--
-- The row, not the object, is the thing the app reads: it carries the
-- original filename, who attached it and when, none of which survives in a
-- storage path. The path is stored rather than a URL because a private
-- object has no durable URL — a signed one is minted per view and expires.

create table if not exists public.edospmis_case_attachments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.edospmis_tenants(id) on delete cascade,
  case_id uuid not null references public.edospmis_cases(id) on delete cascade,
  -- Object path within the bucket. Unique: two rows pointing at one object
  -- would make deletion ambiguous.
  storage_path text not null unique,
  -- As the requester's computer had it. Shown instead of the generated path,
  -- because "Nakumatt price list Oct.pdf" tells an approver something and
  -- "8f3a…-pdf" does not.
  filename text not null,
  content_type text,
  byte_size bigint check (byte_size is null or byte_size >= 0),
  -- What the requester says it is. Not inferred from the file: only they know
  -- whether a PDF is a price list or a specification.
  kind text not null default 'other'
    check (kind in ('price_list', 'quotation_received', 'flyer', 'specification', 'photo', 'other')),
  note text,
  uploaded_by uuid references public.edospmis_users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists edospmis_case_attachments_case_idx
  on public.edospmis_case_attachments(tenant_id, case_id);

comment on table public.edospmis_case_attachments is
  'Evidence a requester attached to their own request. Never a quotation in '
  'the procurement sense - a quotation is submitted by a supplier against an '
  'RFQ and has a signature behind it.';

-- ── Row-level security ────────────────────────────────────────────────
--
-- Read: any member. An attachment exists to be seen by whoever decides, and
-- the approver is rarely the requester.
--
-- Write: whoever may raise a request. Whether this *particular* case is still
-- a draft, and whether this is the requester's own request, is enforced in
-- the server action — a policy cannot express "while the case is a draft"
-- without a join that would run on every row.

alter table public.edospmis_case_attachments enable row level security;

drop policy if exists edospmis_case_attachments_select on public.edospmis_case_attachments;
create policy edospmis_case_attachments_select on public.edospmis_case_attachments
  for select using (public.edospmis_is_member(tenant_id));

drop policy if exists edospmis_case_attachments_insert on public.edospmis_case_attachments;
create policy edospmis_case_attachments_insert on public.edospmis_case_attachments
  for insert with check (public.edospmis_has_permission(tenant_id, 'procurement.pr.create'));

drop policy if exists edospmis_case_attachments_delete on public.edospmis_case_attachments;
create policy edospmis_case_attachments_delete on public.edospmis_case_attachments
  for delete using (public.edospmis_has_permission(tenant_id, 'procurement.pr.edit'));

grant select on public.edospmis_case_attachments to authenticated;
grant insert, delete on public.edospmis_case_attachments to authenticated;
