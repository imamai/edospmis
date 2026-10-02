-- ──────────────────────────────────────────────────────────────────────
-- Returning a bid to its supplier for correction.
--
-- The schema has been ready for this since 0050 — status 'withdrawn', a
-- withdrawn_at column, versions unique per supplier, and a comment saying a
-- bidder may withdraw and submit again. Nothing ever implemented it: no
-- function in the database so much as mentions 'withdrawn'.
--
-- WHAT MAY BE CORRECTED, AND WHAT MAY NOT.
--
-- Documents and forms: yes. An expired CR12, a certificate that did not
-- upload, a form of tender with a blank where a date should be. These are
-- proof of facts that already existed when the bid was made; supplying them
-- again changes nothing about the offer.
--
-- The price: never, through this. Once bids are in, a buyer who can send one
-- back "for correction" and receive a different number has the power to pick
-- the winner after seeing the field, and no amount of logging makes that
-- defensible. A correction carries the original quotation forward untouched.
-- If a price is genuinely wrong the answer is not a correction: before the
-- closing date the bidder withdraws and bids again, and after it the bid is
-- rejected. Both are different acts with different names, which is the point.
--
-- SCOPED, NOT OPEN-ENDED. The buyer names which documents are at fault. Only
-- those are cleared; everything else is carried into the new version and is
-- not re-uploadable. A blanket "do it again" invites a bidder to revise what
-- nobody asked about.
--
-- THE CLOSING DATE HAS TO BEND, AND ONLY HERE. Corrections happen after the
-- closing date — that is when somebody finally reads the pack. The bidder-side
-- functions all refuse past it, correctly, or a late bid would walk in. So the
-- three that gate on it now make one exception: a draft that exists because it
-- was returned. A bidder cannot create that state; only a buyer can, by name,
-- with a reason, in the audit log.
--
-- NOTHING IS DELETED. The returned version keeps its documents, its signature
-- and its content hash, marked withdrawn. What was signed stays signed; the
-- correction is a new version beside it, and both are on file.
-- ──────────────────────────────────────────────────────────────────────

alter table public.edospmis_bid_submissions
  add column if not exists returned_from uuid references public.edospmis_bid_submissions(id) on delete set null,
  add column if not exists return_reason text,
  add column if not exists return_doc_type_ids uuid[],
  add column if not exists return_template_ids uuid[],
  add column if not exists returned_at timestamptz,
  add column if not exists returned_by uuid references public.edospmis_users(id) on delete set null;

comment on column public.edospmis_bid_submissions.returned_from is
  'The submitted version this one reopens. Non-null marks a correction, which is what lets the bidder-side functions past the closing date.';

-- ── The buyer's side ──────────────────────────────────────────────────
create or replace function public.edospmis_return_bid_for_correction(
  p_submission_id uuid,
  p_reason text,
  p_doc_type_ids uuid[],
  p_template_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_sub record;
  v_rfq record;
  v_invite record;
  v_new_id uuid;
  v_next int;
begin
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'Say what needs correcting. The supplier sees this.';
  end if;
  if coalesce(array_length(p_doc_type_ids, 1), 0)
     + coalesce(array_length(p_template_ids, 1), 0) = 0 then
    raise exception 'Choose at least one document to send back.';
  end if;

  select * into v_sub from public.edospmis_bid_submissions where id = p_submission_id;
  if v_sub is null then raise exception 'That submission could not be found.'; end if;

  if not public.edospmis_has_permission(v_sub.tenant_id, 'procurement.rfq.evaluate') then
    raise exception 'You do not have permission to return a bid.';
  end if;
  if v_sub.status <> 'submitted' then
    raise exception 'Only a submitted bid can be returned.';
  end if;

  select * into v_rfq from public.edospmis_rfqs where id = v_sub.rfq_id;
  if v_rfq.status <> 'open' then
    raise exception 'This tender is closed. A bid cannot be returned once it is decided.';
  end if;

  -- After an award there is nothing to correct: the decision is made, and
  -- reopening a losing bid at that point is how a decided tender gets undone.
  if exists (select 1 from public.edospmis_evaluations e where e.rfq_id = v_sub.rfq_id) then
    raise exception 'This tender has been awarded. A bid cannot be returned now.';
  end if;

  select * into v_invite
  from public.edospmis_rfq_suppliers
  where rfq_id = v_sub.rfq_id and supplier_id = v_sub.supplier_id;
  if v_invite is null then
    raise exception 'That supplier is no longer invited to this tender.';
  end if;
  if v_invite.token_expires_at < now() then
    raise exception 'This supplier''s link has expired. Re-invite them first.';
  end if;

  -- One correction at a time. A second return while the first is outstanding
  -- would leave two drafts and no way to say which the bidder is answering.
  if exists (
    select 1 from public.edospmis_bid_submissions bs
     where bs.rfq_id = v_sub.rfq_id and bs.supplier_id = v_sub.supplier_id
       and bs.status = 'draft'
  ) then
    raise exception 'This supplier already has a correction outstanding.';
  end if;

  update public.edospmis_bid_submissions
  set status = 'withdrawn', withdrawn_at = now()
  where id = p_submission_id;

  select coalesce(max(version), 0) + 1 into v_next
  from public.edospmis_bid_submissions
  where rfq_id = v_sub.rfq_id and supplier_id = v_sub.supplier_id;

  insert into public.edospmis_bid_submissions (
    tenant_id, rfq_id, supplier_id, version, status,
    returned_from, return_reason, return_doc_type_ids, return_template_ids,
    returned_at, returned_by
  )
  values (
    v_sub.tenant_id, v_sub.rfq_id, v_sub.supplier_id, v_next, 'draft',
    p_submission_id, btrim(p_reason),
    coalesce(p_doc_type_ids, '{}'), coalesce(p_template_ids, '{}'),
    now(), auth.uid()
  )
  returning id into v_new_id;

  -- Everything nobody complained about comes forward, so the bidder replaces
  -- what was asked for and nothing else.
  insert into public.edospmis_bid_documents (
    tenant_id, submission_id, doc_type_id, storage_path, filename, content_type, byte_size, note
  )
  select bd.tenant_id, v_new_id, bd.doc_type_id, bd.storage_path, bd.filename,
         bd.content_type, bd.byte_size, bd.note
  from public.edospmis_bid_documents bd
  where bd.submission_id = p_submission_id
    and (bd.doc_type_id is null or not (bd.doc_type_id = any (coalesce(p_doc_type_ids, '{}'))));

  insert into public.edospmis_bid_template_responses (
    tenant_id, submission_id, template_id, answers, storage_path, filename, content_type, byte_size
  )
  select br.tenant_id, v_new_id, br.template_id, br.answers, br.storage_path,
         br.filename, br.content_type, br.byte_size
  from public.edospmis_bid_template_responses br
  where br.submission_id = p_submission_id
    and not (br.template_id = any (coalesce(p_template_ids, '{}')));

  -- Back to a state their link will open. 'viewed' rather than 'invited':
  -- they have seen this tender, and saying otherwise loses that.
  update public.edospmis_rfq_suppliers
  set status = 'viewed', responded_at = null
  where id = v_invite.id;

  insert into public.edospmis_audit_logs (tenant_id, actor_id, action, entity_type, entity_id, reason, after)
  values (v_sub.tenant_id, auth.uid(), 'bid.returned', 'bid_submission', p_submission_id,
          btrim(p_reason),
          jsonb_build_object('new_submission_id', v_new_id, 'version', v_next,
                             'doc_type_ids', coalesce(p_doc_type_ids, '{}'),
                             'template_ids', coalesce(p_template_ids, '{}')));

  return v_new_id;
end;
$$;

revoke all on function public.edospmis_return_bid_for_correction(uuid, text, uuid[], uuid[]) from public;
revoke all on function public.edospmis_return_bid_for_correction(uuid, text, uuid[], uuid[]) from anon;
grant execute on function public.edospmis_return_bid_for_correction(uuid, text, uuid[], uuid[]) to authenticated;

-- ── The bidder's side: three gates learn about corrections ────────────
--
-- Each is the function as it was, with the draft looked up before the closing
-- date is judged rather than after, so the judgement can take it into account.

create or replace function public.edospmis_bid_draft_by_token(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_invite record;
  v_rfq record;
  v_draft record;
  v_id uuid;
  v_next int;
begin
  select * into v_invite from public.edospmis_rfq_suppliers where access_token = p_token;
  if v_invite is null then raise exception 'This link is invalid or has expired.'; end if;
  if v_invite.token_expires_at < now() then raise exception 'This link has expired. Ask for a new one.'; end if;
  if v_invite.status in ('submitted', 'declined') then
    raise exception 'You have already responded to this request.';
  end if;

  select * into v_draft
  from public.edospmis_bid_submissions
  where rfq_id = v_invite.rfq_id and supplier_id = v_invite.supplier_id and status = 'draft'
  order by version desc
  limit 1;

  select * into v_rfq from public.edospmis_rfqs where id = v_invite.rfq_id;
  if v_rfq.status <> 'open' then raise exception 'This request is no longer open.'; end if;
  if v_rfq.closing_date is not null and v_rfq.closing_date < current_date
     and coalesce(v_draft.returned_from, null) is null then
    raise exception 'The closing date for this request has passed.';
  end if;

  if v_draft.id is not null then return v_draft.id; end if;

  -- A withdrawn-and-resubmitted bid gets the next version, so both are kept.
  select coalesce(max(version), 0) + 1 into v_next
  from public.edospmis_bid_submissions
  where rfq_id = v_invite.rfq_id and supplier_id = v_invite.supplier_id;

  insert into public.edospmis_bid_submissions (tenant_id, rfq_id, supplier_id, version, status)
  values (v_rfq.tenant_id, v_invite.rfq_id, v_invite.supplier_id, v_next, 'draft')
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.edospmis_bid_sign_by_token(
  p_token text,
  p_signed_name text,
  p_signed_position text,
  p_signed_ip text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_invite record;
  v_rfq record;
  v_submission record;
  v_missing text;
  v_payload text;
  v_hash text;
begin
  if nullif(btrim(coalesce(p_signed_name, '')), '') is null then
    raise exception 'Type the name of the person signing.';
  end if;

  select * into v_invite from public.edospmis_rfq_suppliers where access_token = p_token;
  if v_invite is null then raise exception 'This link is invalid or has expired.'; end if;
  if v_invite.token_expires_at < now() then raise exception 'This link has expired. Ask for a new one.'; end if;
  if v_invite.status in ('submitted', 'declined') then
    raise exception 'You have already responded to this request.';
  end if;

  select * into v_submission
  from public.edospmis_bid_submissions
  where rfq_id = v_invite.rfq_id and supplier_id = v_invite.supplier_id and status = 'draft'
  order by version desc
  limit 1;
  if v_submission is null then
    raise exception 'There is nothing to submit yet. Upload the documents and complete the form first.';
  end if;

  select * into v_rfq from public.edospmis_rfqs where id = v_invite.rfq_id;
  if v_rfq.status <> 'open' then raise exception 'This request is no longer open.'; end if;
  if v_rfq.closing_date is not null and v_rfq.closing_date < current_date
     and v_submission.returned_from is null then
    raise exception 'The closing date for this request has passed.';
  end if;

  -- The bidder is told what is missing before they sign, not after. Mandatory
  -- only — an optional document they chose not to send is their decision.
  select string_agg(label, ', ' order by label) into v_missing
  from (
    select d.name as label
    from public.edospmis_rfq_requirements r
    join public.edospmis_supplier_doc_types d on d.id = r.doc_type_id
    where r.rfq_id = v_invite.rfq_id and r.is_mandatory and r.doc_type_id is not null
      and not exists (
        select 1 from public.edospmis_bid_documents bd
        where bd.submission_id = v_submission.id and bd.doc_type_id = r.doc_type_id
      )
    union all
    select t.name
    from public.edospmis_rfq_requirements r
    join public.edospmis_procurement_templates t on t.id = r.template_id
    where r.rfq_id = v_invite.rfq_id and r.is_mandatory and r.template_id is not null
      and not exists (
        select 1 from public.edospmis_bid_template_responses br
        where br.submission_id = v_submission.id and br.template_id = r.template_id
      )
  ) as outstanding;

  if v_missing is not null then
    raise exception 'Still needed before you can submit: %.', v_missing;
  end if;

  select
    coalesce((
      select string_agg(br.template_id::text || ':' || br.answers::text || ':' || coalesce(br.filename, ''), '|'
                        order by br.template_id)
      from public.edospmis_bid_template_responses br where br.submission_id = v_submission.id
    ), '')
    || '#' ||
    coalesce((
      select string_agg(coalesce(bd.doc_type_id::text, 'extra') || ':' || bd.filename || ':' || coalesce(bd.byte_size, 0)::text, '|'
                        order by bd.doc_type_id nulls last, bd.filename)
      from public.edospmis_bid_documents bd where bd.submission_id = v_submission.id
    ), '')
    || '#' ||
    coalesce((
      select string_agg(q.total_cents::text || ':' || q.currency, '|' order by q.id)
      from public.edospmis_quotations q
      where q.rfq_id = v_invite.rfq_id and q.supplier_id = v_invite.supplier_id
    ), 'no-quotation')
  into v_payload;

  v_hash := encode(sha256(convert_to(v_payload, 'UTF8')), 'hex');

  update public.edospmis_bid_submissions
  set status = 'submitted',
      signed_name = btrim(p_signed_name),
      signed_position = nullif(btrim(coalesce(p_signed_position, '')), ''),
      signed_at = now(),
      signed_ip = nullif(btrim(coalesce(p_signed_ip, '')), ''),
      content_hash = v_hash,
      submitted_at = now()
  where id = v_submission.id;

  insert into public.edospmis_audit_logs (tenant_id, actor_id, action, entity_type, entity_id, after)
  values (v_rfq.tenant_id, null, 'bid.submitted', 'bid_submission', v_submission.id,
          jsonb_build_object('supplier_id', v_invite.supplier_id, 'signed_name', btrim(p_signed_name),
                             'content_hash', v_hash, 'version', v_submission.version,
                             'correction_of', v_submission.returned_from));

  return jsonb_build_object('submission_id', v_submission.id, 'content_hash', v_hash);
end;
$$;

revoke all on function public.edospmis_bid_sign_by_token(text, text, text, text) from public;
revoke all on function public.edospmis_bid_sign_by_token(text, text, text, text) from anon;
revoke all on function public.edospmis_bid_sign_by_token(text, text, text, text) from authenticated;
grant execute on function public.edospmis_bid_sign_by_token(text, text, text, text) to service_role;

-- The bidder's page, told why it is open again and what to replace.
create or replace function public.edospmis_bid_pack_by_token(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_invite record;
  v_rfq record;
  v_submission record;
  v_result jsonb;
begin
  select * into v_invite from public.edospmis_rfq_suppliers where access_token = p_token;
  if v_invite is null then
    raise exception 'This link is invalid or has expired.';
  end if;
  select * into v_rfq from public.edospmis_rfqs where id = v_invite.rfq_id;

  select * into v_submission
  from public.edospmis_bid_submissions
  where rfq_id = v_invite.rfq_id and supplier_id = v_invite.supplier_id and status = 'draft'
  order by version desc
  limit 1;

  select jsonb_build_object(
    'rfq_id', v_rfq.id,
    'closing_date', v_rfq.closing_date,
    'closed', (
      v_rfq.status <> 'open'
      or (v_rfq.closing_date is not null and v_rfq.closing_date < current_date
          and v_submission.returned_from is null)
    ),
    'expired', v_invite.token_expires_at < now(),
    'invite_status', v_invite.status,
    'submission_id', v_submission.id,
    'correction', case
      when v_submission.returned_from is null then null
      else jsonb_build_object(
        'reason', v_submission.return_reason,
        'doc_type_ids', to_jsonb(coalesce(v_submission.return_doc_type_ids, '{}')),
        'template_ids', to_jsonb(coalesce(v_submission.return_template_ids, '{}'))
      )
    end,
    'requirements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'requirement_id', r.id,
        'kind', case when r.doc_type_id is not null then 'document' else 'template' end,
        'doc_type_id', r.doc_type_id,
        'template_id', r.template_id,
        'name', coalesce(d.name, t.name),
        'description', coalesce(d.description, t.description),
        'is_mandatory', r.is_mandatory,
        'template_kind', t.kind,
        'template_fields', t.fields,
        'template_instructions', t.instructions,
        'template_filename', t.filename
      ) order by r.is_mandatory desc, coalesce(d.sort_order, 1000), coalesce(d.name, t.name))
      from public.edospmis_rfq_requirements r
      left join public.edospmis_supplier_doc_types d on d.id = r.doc_type_id
      left join public.edospmis_procurement_templates t on t.id = r.template_id
      where r.rfq_id = v_invite.rfq_id
    ), '[]'::jsonb),
    'documents', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', bd.id, 'doc_type_id', bd.doc_type_id, 'filename', bd.filename,
        'byte_size', bd.byte_size, 'note', bd.note
      ) order by bd.created_at)
      from public.edospmis_bid_documents bd
      where bd.submission_id = v_submission.id
    ), '[]'::jsonb),
    'template_responses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'template_id', br.template_id, 'answers', br.answers, 'filename', br.filename
      ))
      from public.edospmis_bid_template_responses br
      where br.submission_id = v_submission.id
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.edospmis_bid_pack_by_token(text) from public;
revoke all on function public.edospmis_bid_pack_by_token(text) from anon;
revoke all on function public.edospmis_bid_pack_by_token(text) from authenticated;
grant execute on function public.edospmis_bid_pack_by_token(text) to service_role;

-- ── The price is carried, never re-taken ──────────────────────────────
--
-- A correction reopens the invitation, so the bidder's page offers its one
-- submit again. Without this it would insert a second quotation beside the
-- first and leave two prices on one bid.
create or replace function public.edospmis_submit_bid_by_token(
  p_token text,
  p_line_prices jsonb,
  p_notes text,
  p_supplier_name text,
  p_supplier_email text,
  p_supplier_phone text,
  p_signed_name text,
  p_signed_position text,
  p_signed_ip text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_invite record;
  v_requirements int;
  v_already_signed boolean;
  v_has_quotation boolean;
  v_result jsonb := '{}'::jsonb;
begin
  select rs.* into v_invite
  from public.edospmis_rfq_suppliers rs
  where rs.access_token = p_token;
  if v_invite is null then
    raise exception 'This link is invalid or has expired.';
  end if;

  select count(*) into v_requirements
  from public.edospmis_rfq_requirements r
  where r.rfq_id = v_invite.rfq_id;

  select exists (
    select 1 from public.edospmis_bid_submissions bs
     where bs.rfq_id = v_invite.rfq_id
       and bs.supplier_id = v_invite.supplier_id
       and bs.status = 'submitted'
  ) into v_already_signed;

  select exists (
    select 1 from public.edospmis_quotations q
     where q.rfq_id = v_invite.rfq_id and q.supplier_id = v_invite.supplier_id
  ) into v_has_quotation;

  if v_requirements > 0 and not v_already_signed
     and nullif(btrim(coalesce(p_signed_name, '')), '') is null then
    raise exception 'Type the name of the person signing.';
  end if;

  -- Their price already stands. A correction is about the paperwork, and a
  -- second quotation here is how a returned bid quietly becomes a re-priced one.
  if not v_has_quotation then
    perform public.edospmis_quote_record_by_token(
      p_token, p_line_prices, p_notes, p_supplier_name, p_supplier_email, p_supplier_phone);
  end if;

  if v_requirements > 0 and not v_already_signed then
    perform public.edospmis_bid_draft_by_token(p_token);
    v_result := public.edospmis_bid_sign_by_token(
      p_token, p_signed_name, p_signed_position, p_signed_ip);
  end if;

  update public.edospmis_rfq_suppliers
  set status = 'submitted', responded_at = now()
  where id = v_invite.id;

  return v_result;
end;
$$;

revoke all on function public.edospmis_submit_bid_by_token(text, jsonb, text, text, text, text, text, text, text) from public;
revoke all on function public.edospmis_submit_bid_by_token(text, jsonb, text, text, text, text, text, text, text) from anon;
revoke all on function public.edospmis_submit_bid_by_token(text, jsonb, text, text, text, text, text, text, text) from authenticated;
grant execute on function public.edospmis_submit_bid_by_token(text, jsonb, text, text, text, text, text, text, text) to service_role;
