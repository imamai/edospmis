-- ──────────────────────────────────────────────────────────────────────
-- The tender pack: what a bidder must return before they can be awarded.
--
-- Until now an RFQ asked a supplier for one thing — a price. That is not how
-- a tender works anywhere that has to answer for its procurement. A bidder is
-- issued a document, completes it, signs it, and returns it with proof that
-- the company is real and tax-compliant. Award without that is precisely the
-- audit finding this module exists to prevent.
--
-- So one invitation now carries three things, and the supplier returns them
-- together through the token page they already use:
--
--   documents   CR12, KRA PIN, tax compliance — whatever this tender needs.
--   template    the form of tender itself, completed and signed.
--   prices      the quotation, as before.
--
-- One link, not three. A bidder given three links misses one, and the
-- missing one is always discovered after the closing date.
--
-- Deliberately separate from contracts. This is pre-award, signed by whoever
-- bids; a contract is post-award, signed under different authority. They
-- share the signing idea and nothing else — but the signed pack carries
-- forward into the contract on award, so nothing is re-keyed.
-- ──────────────────────────────────────────────────────────────────────

-- ── 1. The documents a tenant can ask for ─────────────────────────────
--
-- tenant_id null is the shared library every workspace sees, the same device
-- the contract templates use. A tenant adds its own — an NCA licence, a
-- sector permit — without us shipping a release.

create table if not exists public.edospmis_supplier_doc_types (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.edospmis_tenants(id) on delete cascade,
  name text not null,
  description text,
  -- Suggested rather than enforced: this is what gets pre-ticked when an
  -- officer sets up a tender, and they can always untick it. The requirement
  -- that actually binds is recorded per RFQ, below.
  default_required boolean not null default false,
  sort_order int not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists edospmis_supplier_doc_types_tenant_idx
  on public.edospmis_supplier_doc_types(tenant_id, is_active);

alter table public.edospmis_supplier_doc_types enable row level security;

drop policy if exists edospmis_supplier_doc_types_select on public.edospmis_supplier_doc_types;
create policy edospmis_supplier_doc_types_select on public.edospmis_supplier_doc_types
  for select using (tenant_id is null or public.edospmis_is_member(tenant_id));

drop policy if exists edospmis_supplier_doc_types_write on public.edospmis_supplier_doc_types;
create policy edospmis_supplier_doc_types_write on public.edospmis_supplier_doc_types
  for all using (tenant_id is not null and public.edospmis_has_permission(tenant_id, 'procurement.supplier.manage'))
  with check (tenant_id is not null and public.edospmis_has_permission(tenant_id, 'procurement.supplier.manage'));

grant select on public.edospmis_supplier_doc_types to authenticated;
grant insert, update, delete on public.edospmis_supplier_doc_types to authenticated;

-- The Kenyan baseline. Three pre-ticked because they are what any serious
-- buyer asks for; the rest offered and left to the officer.
-- Guarded on the shared library being empty rather than ON CONFLICT: there is
-- no unique constraint for it to conflict on, so a re-run would otherwise
-- insert a second copy of every row.
insert into public.edospmis_supplier_doc_types (tenant_id, name, description, default_required, sort_order)
select * from (values
  (null::uuid, 'CR12', 'Certificate from the Registrar of Companies listing current directors and shareholding.', true, 10),
  (null::uuid, 'KRA PIN certificate', 'The company''s PIN certificate.', true, 20),
  (null::uuid, 'Tax Compliance Certificate', 'Valid TCC from KRA. Check the expiry date — a lapsed one is not compliance.', true, 30),
  (null::uuid, 'Certificate of incorporation', 'Proof the company exists as registered.', false, 40),
  (null::uuid, 'Business permit', 'Current single business permit from the county.', false, 50),
  (null::uuid, 'AGPO certificate', 'For the youth, women and persons-with-disability reservation, where it applies.', false, 60),
  (null::uuid, 'NCA registration', 'National Construction Authority registration, for works.', false, 70),
  (null::uuid, 'Audited accounts', 'Most recent audited financial statements.', false, 80),
  (null::uuid, 'Bank reference', 'A letter from the bidder''s bank.', false, 90)
) as seed(tenant_id, name, description, default_required, sort_order)
where not exists (
  select 1 from public.edospmis_supplier_doc_types where tenant_id is null
);

-- ── 2. The template a bidder fills and signs ──────────────────────────
--
-- Two shapes, because real practice has both. A 'document' is the tender file
-- a buyer already has — the supplier downloads it, completes it, and returns
-- a signed copy; this is what most organisations actually do. A 'form' is
-- rendered as fields in the page, which is better where the answers need to
-- be comparable across bidders rather than read one PDF at a time.

create table if not exists public.edospmis_procurement_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.edospmis_tenants(id) on delete cascade,
  name text not null,
  description text,
  kind text not null default 'document' check (kind in ('document', 'form')),
  -- 'document': the issued file, in the attachments bucket under
  -- <tenant_id>/templates/. The shared library's rows have none — there is no
  -- tenant folder to put them in — so those are 'form' only.
  storage_path text,
  filename text,
  content_type text,
  byte_size bigint,
  -- 'form': the questions, as [{ key, label, type, required, help }]. Kept as
  -- jsonb rather than its own table because a template's questions are only
  -- ever read and written whole, never queried across templates.
  fields jsonb not null default '[]'::jsonb,
  -- Instructions shown above the form or beside the download.
  instructions text,
  is_active boolean not null default true,
  created_by uuid references public.edospmis_users(id) on delete set null,
  created_at timestamptz not null default now(),
  -- A 'document' template with no file is an empty promise; a 'form' with no
  -- questions is a page with nothing on it.
  check (
    (kind = 'document' and storage_path is not null)
    or (kind = 'form' and jsonb_array_length(fields) > 0)
  )
);

create index if not exists edospmis_procurement_templates_tenant_idx
  on public.edospmis_procurement_templates(tenant_id, is_active);

alter table public.edospmis_procurement_templates enable row level security;

drop policy if exists edospmis_procurement_templates_select on public.edospmis_procurement_templates;
create policy edospmis_procurement_templates_select on public.edospmis_procurement_templates
  for select using (tenant_id is null or public.edospmis_is_member(tenant_id));

drop policy if exists edospmis_procurement_templates_write on public.edospmis_procurement_templates;
create policy edospmis_procurement_templates_write on public.edospmis_procurement_templates
  for all using (tenant_id is not null and public.edospmis_has_permission(tenant_id, 'procurement.rfq.create'))
  with check (tenant_id is not null and public.edospmis_has_permission(tenant_id, 'procurement.rfq.create'));

grant select on public.edospmis_procurement_templates to authenticated;
grant insert, update, delete on public.edospmis_procurement_templates to authenticated;

-- Same guard, same reason.
insert into public.edospmis_procurement_templates (tenant_id, name, description, kind, fields, instructions)
select * from (values (
  null::uuid,
  'Form of tender',
  'The bidder''s own declaration: who they are, what they are offering, and that the offer stands.',
  'form',
  '[
    {"key":"company_name","label":"Registered company name","type":"text","required":true},
    {"key":"registration_number","label":"Company registration number","type":"text","required":true},
    {"key":"kra_pin","label":"KRA PIN","type":"text","required":true},
    {"key":"postal_address","label":"Postal address","type":"text","required":false},
    {"key":"contact_person","label":"Contact person and position","type":"text","required":true},
    {"key":"contact_phone","label":"Telephone","type":"text","required":true},
    {"key":"validity_days","label":"How many days does this offer stand?","type":"number","required":true,"help":"Counted from the closing date."},
    {"key":"delivery_days","label":"Delivery lead time in days","type":"number","required":true},
    {"key":"payment_terms","label":"Payment terms sought","type":"text","required":false},
    {"key":"litigation","label":"Any current litigation or debarment?","type":"textarea","required":true,"help":"Write None if there is none. A false answer here voids the tender."},
    {"key":"conflict","label":"Any interest of a buyer''s employee or their family in your company?","type":"textarea","required":true,"help":"Write None if there is none."}
  ]'::jsonb,
  'Complete every field, then sign at the foot of the page. Your signature covers this form, the documents you have uploaded and the prices you have entered.'
)) as seed(tenant_id, name, description, kind, fields, instructions)
where not exists (
  select 1 from public.edospmis_procurement_templates where tenant_id is null
);

-- ── 3. What this particular tender requires ───────────────────────────
--
-- The tick lists an officer sets when inviting suppliers. One row per
-- requirement, whether it is a document or a template, so "what is still
-- outstanding" is one query rather than two that have to be reconciled.

create table if not exists public.edospmis_rfq_requirements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.edospmis_tenants(id) on delete cascade,
  rfq_id uuid not null references public.edospmis_rfqs(id) on delete cascade,
  doc_type_id uuid references public.edospmis_supplier_doc_types(id) on delete restrict,
  template_id uuid references public.edospmis_procurement_templates(id) on delete restrict,
  is_mandatory boolean not null default true,
  created_at timestamptz not null default now(),
  -- Exactly one of the two. A row that is both, or neither, has no meaning.
  check (num_nonnulls(doc_type_id, template_id) = 1)
);

-- on delete restrict above, not cascade: deleting a document type that a live
-- tender requires would quietly drop the requirement and let an incomplete
-- bid through. Withdraw the type instead, which leaves history intact.

create unique index if not exists edospmis_rfq_requirements_doc_idx
  on public.edospmis_rfq_requirements(rfq_id, doc_type_id) where doc_type_id is not null;
create unique index if not exists edospmis_rfq_requirements_template_idx
  on public.edospmis_rfq_requirements(rfq_id, template_id) where template_id is not null;

alter table public.edospmis_rfq_requirements enable row level security;

drop policy if exists edospmis_rfq_requirements_select on public.edospmis_rfq_requirements;
create policy edospmis_rfq_requirements_select on public.edospmis_rfq_requirements
  for select using (public.edospmis_is_member(tenant_id));

drop policy if exists edospmis_rfq_requirements_write on public.edospmis_rfq_requirements;
create policy edospmis_rfq_requirements_write on public.edospmis_rfq_requirements
  for all using (public.edospmis_has_permission(tenant_id, 'procurement.rfq.send'))
  with check (public.edospmis_has_permission(tenant_id, 'procurement.rfq.send'));

grant select on public.edospmis_rfq_requirements to authenticated;
grant insert, update, delete on public.edospmis_rfq_requirements to authenticated;

-- ── 4. The pack a bidder returns ──────────────────────────────────────
--
-- Versioned. Before the closing date a bidder may withdraw and submit again,
-- and both are kept — a tender where the earlier submission disappears cannot
-- be audited. After the closing date, nothing.
--
-- `content_hash` is what makes the signature mean something: it is a digest
-- of the exact answers, document list and prices submitted. A signature that
-- is only a name and a timestamp could be claimed to cover any later version.

create table if not exists public.edospmis_bid_submissions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.edospmis_tenants(id) on delete cascade,
  rfq_id uuid not null references public.edospmis_rfqs(id) on delete cascade,
  supplier_id uuid not null references public.edospmis_suppliers(id) on delete cascade,
  version int not null default 1,
  status text not null default 'draft' check (status in ('draft', 'submitted', 'withdrawn')),
  -- Typed by the bidder, with the address and moment it was typed from. Not a
  -- drawn squiggle: a typed name plus an immutable record of what it covered
  -- is better evidence than an image anybody could paste.
  signed_name text,
  signed_position text,
  signed_at timestamptz,
  signed_ip text,
  content_hash text,
  submitted_at timestamptz,
  withdrawn_at timestamptz,
  created_at timestamptz not null default now(),
  unique (rfq_id, supplier_id, version),
  -- A submitted pack must carry its signature; a draft must not pretend to.
  check (
    (status = 'submitted' and signed_name is not null and signed_at is not null and content_hash is not null)
    or status <> 'submitted'
  )
);

create index if not exists edospmis_bid_submissions_rfq_idx
  on public.edospmis_bid_submissions(tenant_id, rfq_id, status);

alter table public.edospmis_bid_submissions enable row level security;

-- Read by any member of the buying tenant. No write policy at all: a bidder
-- has no login, so every write arrives through the token-checked functions
-- below, and nothing else should be able to touch a submitted bid.
drop policy if exists edospmis_bid_submissions_select on public.edospmis_bid_submissions;
create policy edospmis_bid_submissions_select on public.edospmis_bid_submissions
  for select using (public.edospmis_is_member(tenant_id));

grant select on public.edospmis_bid_submissions to authenticated;

create table if not exists public.edospmis_bid_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.edospmis_tenants(id) on delete cascade,
  submission_id uuid not null references public.edospmis_bid_submissions(id) on delete cascade,
  -- Which requirement this answers. Null for something the bidder sent that
  -- was not asked for, which is allowed and sometimes useful.
  doc_type_id uuid references public.edospmis_supplier_doc_types(id) on delete set null,
  storage_path text not null unique,
  filename text not null,
  content_type text,
  byte_size bigint,
  -- A bidder's own note, e.g. "TCC expires 12 March".
  note text,
  created_at timestamptz not null default now()
);

create index if not exists edospmis_bid_documents_submission_idx
  on public.edospmis_bid_documents(submission_id);

alter table public.edospmis_bid_documents enable row level security;

drop policy if exists edospmis_bid_documents_select on public.edospmis_bid_documents;
create policy edospmis_bid_documents_select on public.edospmis_bid_documents
  for select using (public.edospmis_is_member(tenant_id));

grant select on public.edospmis_bid_documents to authenticated;

create table if not exists public.edospmis_bid_template_responses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.edospmis_tenants(id) on delete cascade,
  submission_id uuid not null references public.edospmis_bid_submissions(id) on delete cascade,
  template_id uuid not null references public.edospmis_procurement_templates(id) on delete restrict,
  -- 'form': the bidder's answers, keyed by the template's field keys.
  answers jsonb not null default '{}'::jsonb,
  -- 'document': the completed, signed file the bidder returned.
  storage_path text,
  filename text,
  content_type text,
  byte_size bigint,
  -- The template exactly as issued, copied in at submission. A buyer who
  -- edits their template next month must not change what somebody signed.
  issued_snapshot jsonb,
  created_at timestamptz not null default now(),
  unique (submission_id, template_id)
);

alter table public.edospmis_bid_template_responses enable row level security;

drop policy if exists edospmis_bid_template_responses_select on public.edospmis_bid_template_responses;
create policy edospmis_bid_template_responses_select on public.edospmis_bid_template_responses
  for select using (public.edospmis_is_member(tenant_id));

grant select on public.edospmis_bid_template_responses to authenticated;

-- ── 5. The bidder's own folder in the attachments bucket ──────────────
--
-- Bid files live at <tenant_id>/bids/<submission_id>/..., inside the private
-- bucket created in migration 0049, so a buyer's members can read them under
-- the policy already there and nobody else can.
--
-- A bidder has no session, so their upload cannot go through a storage
-- policy. It goes through a server action that checks the invitation token
-- first and writes with the service role — the only place in this app that
-- does, and only because there is no identity to check instead.

-- ── 6. What is still outstanding for one bidder ───────────────────────
--
-- One function, used in three places that must agree: the bidder's own page,
-- the evaluation table, and the award gate. Three separate implementations of
-- "is this bid complete" is three chances to disagree, and the one that
-- matters is the gate.

create or replace function public.edospmis_bid_outstanding(p_rfq_id uuid, p_supplier_id uuid)
returns table (requirement_id uuid, kind text, label text, is_mandatory boolean)
language sql
stable
security invoker
set search_path = public
as $$
  with submission as (
    select id
    from public.edospmis_bid_submissions
    where rfq_id = p_rfq_id and supplier_id = p_supplier_id and status = 'submitted'
    order by version desc
    limit 1
  )
  select r.id, 'document'::text, d.name, r.is_mandatory
  from public.edospmis_rfq_requirements r
  join public.edospmis_supplier_doc_types d on d.id = r.doc_type_id
  where r.rfq_id = p_rfq_id
    and r.doc_type_id is not null
    and not exists (
      select 1
      from public.edospmis_bid_documents bd
      where bd.submission_id = (select id from submission)
        and bd.doc_type_id = r.doc_type_id
    )
  union all
  select r.id, 'template'::text, t.name, r.is_mandatory
  from public.edospmis_rfq_requirements r
  join public.edospmis_procurement_templates t on t.id = r.template_id
  where r.rfq_id = p_rfq_id
    and r.template_id is not null
    and not exists (
      select 1
      from public.edospmis_bid_template_responses br
      where br.submission_id = (select id from submission)
        and br.template_id = r.template_id
    );
$$;

revoke all on function public.edospmis_bid_outstanding(uuid, uuid) from public;
revoke all on function public.edospmis_bid_outstanding(uuid, uuid) from anon;
grant execute on function public.edospmis_bid_outstanding(uuid, uuid) to authenticated;

-- ── 7. The award gate ─────────────────────────────────────────────────
--
-- Enforced inside the award function rather than in the UI, so no caller can
-- route around it.
--
-- Blocking is a deliberate departure from how this app treats the budget,
-- which warns and records rather than refusing. The reasoning differs: an
-- over-budget request that is refused gets raised outside the system, which
-- is worse than seeing it. An award made without the bidder's signed tender
-- cannot be made good afterwards — an award is far harder to unwind than a
-- requisition, and the whole purpose of the pack is that the evidence exists
-- *before* the decision.
--
-- The override is there for the genuine emergency, and records who used it
-- and why. An override nobody can see is the same as no gate.

alter table public.edospmis_evaluations
  add column if not exists requirements_override_reason text,
  add column if not exists requirements_overridden_by uuid references public.edospmis_users(id) on delete set null;

comment on column public.edospmis_evaluations.requirements_override_reason is
  'Why this award went ahead with the bidder''s pack incomplete. Null is the '
  'normal case and means nothing was missing.';

-- Carried into the contract on award, so the signed pack is not re-keyed.
alter table public.edospmis_contracts
  add column if not exists bid_submission_id uuid references public.edospmis_bid_submissions(id) on delete set null;

drop function if exists public.edospmis_award_po(uuid, uuid, text, date);

create or replace function public.edospmis_award_po(
  p_rfq_id uuid,
  p_quotation_id uuid,
  p_notes text,
  p_expected_delivery_date date,
  p_override_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_rfq record;
  v_quotation record;
  v_tenant record;
  v_case_number text;
  v_po_number text;
  v_po_id uuid;
  v_po_status text;
  v_case_status text;
  v_approved_at timestamptz;
  v_missing text;
  v_override text;
begin
  select * into v_rfq from public.edospmis_rfqs where id = p_rfq_id;
  if v_rfq is null then
    raise exception 'That RFQ could not be found.';
  end if;
  if not public.edospmis_has_permission(v_rfq.tenant_id, 'procurement.po.issue') then
    raise exception 'You do not have permission to issue a purchase order.';
  end if;
  if v_rfq.status <> 'open' then
    raise exception 'This RFQ has already been closed.';
  end if;

  select * into v_quotation from public.edospmis_quotations where id = p_quotation_id and rfq_id = p_rfq_id;
  if v_quotation is null then
    raise exception 'That quotation does not belong to this RFQ.';
  end if;

  -- The gate. Mandatory requirements only: an optional one that was asked for
  -- and not supplied is worth seeing on the evaluation, not worth refusing an
  -- award over.
  select string_agg(label, ', ' order by label) into v_missing
  from public.edospmis_bid_outstanding(p_rfq_id, v_quotation.supplier_id)
  where is_mandatory;

  v_override := nullif(btrim(coalesce(p_override_reason, '')), '');

  if v_missing is not null and v_override is null then
    raise exception 'This bidder has not returned: %. Award is blocked until they do, or record a reason for proceeding without it.', v_missing;
  end if;

  select * into v_tenant from public.edospmis_tenants where id = v_rfq.tenant_id;
  v_po_status := case when v_tenant.requires_po_approval then 'pending_approval' else 'issued' end;
  v_case_status := case when v_tenant.requires_po_approval then 'po_approval' else 'awarded' end;
  v_approved_at := case when v_tenant.requires_po_approval then null else now() end;

  select case_number into v_case_number from public.edospmis_cases where id = v_rfq.case_id;
  v_po_number := regexp_replace(v_case_number, '^PR', 'PO');

  insert into public.edospmis_evaluations
    (tenant_id, rfq_id, selected_quotation_id, notes, decided_by,
     requirements_override_reason, requirements_overridden_by)
  values
    (v_rfq.tenant_id, p_rfq_id, p_quotation_id, p_notes, auth.uid(),
     case when v_missing is not null then v_override else null end,
     case when v_missing is not null then auth.uid() else null end);

  insert into public.edospmis_purchase_orders
    (tenant_id, case_id, rfq_id, supplier_id, po_number, items, total_cents, currency, status, expected_delivery_date, issued_by, approved_at)
  values
    (v_rfq.tenant_id, v_rfq.case_id, p_rfq_id, v_quotation.supplier_id, v_po_number, v_rfq.items,
     v_quotation.total_cents, v_quotation.currency, v_po_status, p_expected_delivery_date, auth.uid(), v_approved_at)
  returning id into v_po_id;

  update public.edospmis_rfqs set status = 'closed' where id = p_rfq_id;
  update public.edospmis_cases
  set status = v_case_status, current_stage_key = v_case_status
  where id = v_rfq.case_id;

  insert into public.edospmis_audit_logs (tenant_id, actor_id, action, entity_type, entity_id, after)
  values (v_rfq.tenant_id, auth.uid(), case when v_tenant.requires_po_approval then 'po.pending_approval' else 'po.issued' end,
          'purchase_order', v_po_id,
          jsonb_build_object(
            'rfq_id', p_rfq_id,
            'supplier_id', v_quotation.supplier_id,
            'total_cents', v_quotation.total_cents,
            'requirements_missing', v_missing,
            'override_reason', case when v_missing is not null then v_override else null end));

  return v_po_id;
end;
$$;

revoke all on function public.edospmis_award_po(uuid, uuid, text, date, text) from public;
revoke all on function public.edospmis_award_po(uuid, uuid, text, date, text) from anon;
grant execute on function public.edospmis_award_po(uuid, uuid, text, date, text) to authenticated;
