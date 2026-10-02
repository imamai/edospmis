-- ──────────────────────────────────────────────────────────────────────
-- One submission, not two halves.
--
-- THE PROBLEM. The bidder's page carried two independent submit buttons:
-- "Submit quotation" (prices) and "Sign and submit" (documents + signature).
-- Neither knew about the other, and BOTH ORDERS lose something:
--
--   Prices first  — sets the invitation to 'submitted', after which the page
--                   renders only "thank you". The tender pack disappears, and
--                   edospmis_bid_draft_by_token refuses to reopen it. The
--                   bidder is locked out of uploading the documents, the buyer
--                   cannot award because the award gate still counts them
--                   missing, and the bidder has been thanked, so nobody knows.
--
--   Documents first — signs a content hash whose price section reads
--                   'no-quotation'. The signature then covers no price at all,
--                   which is the one thing a form of tender exists to bind.
--                   The live system has exactly this: a bid on "Cups" signed
--                   with three documents and zero quotations.
--
-- THE FIX. The quotation is recorded, the draft is signed, and the invitation
-- is marked answered, in that order, in one transaction. Order matters: the
-- signature hash reads the quotations table, so the price has to be there
-- before the hash is taken, and the invitation has to still be open while the
-- signing function runs its own checks.
--
-- ONE IMPLEMENTATION. The quotation logic is lifted out of
-- edospmis_submit_quotation_by_token into a helper that does everything except
-- close the invitation, and both entry points now call it. Copying those
-- thirty-five lines instead would have left two versions of supplier matching
-- and prospect creation to drift apart.
--
-- A PROSPECT'S DOCUMENTS ARE RECLAIMED. A sourced prospect has no supplier_id
-- until they submit, but edospmis_bid_draft_by_token keys the draft on
-- supplier_id — so a prospect's uploads landed on a draft with a null
-- supplier_id that the signing step would never find again ("there is nothing
-- to submit yet", with their files sitting right there). The helper adopts
-- those drafts once it knows who they are.
-- ──────────────────────────────────────────────────────────────────────

create or replace function public.edospmis_quote_record_by_token(
  p_token text,
  p_line_prices jsonb,
  p_notes text,
  p_supplier_name text,
  p_supplier_email text,
  p_supplier_phone text
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_invite record;
  v_rfq record;
  v_supplier_id uuid;
  v_total_cents bigint;
begin
  select * into v_invite from public.edospmis_rfq_suppliers where access_token = p_token;
  if v_invite is null then
    raise exception 'This link is invalid or has expired.';
  end if;
  if v_invite.token_expires_at < now() then
    raise exception 'This link has expired — ask for a new one.';
  end if;
  if v_invite.status = 'submitted' then
    raise exception 'A quotation has already been submitted for this invitation.';
  end if;
  if v_invite.status = 'declined' then
    raise exception 'This invitation was already declined.';
  end if;

  select * into v_rfq from public.edospmis_rfqs where id = v_invite.rfq_id;
  if v_rfq.status <> 'open' then
    raise exception 'This request for quotation is no longer open.';
  end if;

  select coalesce(sum((elem->>'qty')::numeric * (elem->>'unit_price_cents')::numeric), 0)::bigint
  into v_total_cents
  from jsonb_array_elements(p_line_prices) elem;
  if v_total_cents <= 0 then
    raise exception 'Enter at least one price.';
  end if;

  v_supplier_id := v_invite.supplier_id;
  if v_supplier_id is null then
    if coalesce(trim(p_supplier_name), '') = '' then
      raise exception 'Enter your company name.';
    end if;
    if p_supplier_email is not null and trim(p_supplier_email) <> '' then
      select s.id into v_supplier_id from public.edospmis_suppliers s
      where s.tenant_id = v_rfq.tenant_id and lower(s.email) = lower(trim(p_supplier_email))
      limit 1;
    end if;
    if v_supplier_id is null then
      insert into public.edospmis_suppliers (tenant_id, name, email, phone, is_active)
      values (
        v_rfq.tenant_id, trim(p_supplier_name),
        nullif(trim(coalesce(p_supplier_email, '')), ''), nullif(trim(coalesce(p_supplier_phone, '')), ''),
        false
      )
      returning id into v_supplier_id;
    end if;
    update public.edospmis_rfq_suppliers set supplier_id = v_supplier_id where id = v_invite.id;

    -- Anything they uploaded before we knew who they were.
    update public.edospmis_bid_submissions
    set supplier_id = v_supplier_id
    where rfq_id = v_invite.rfq_id and supplier_id is null and status = 'draft';
  end if;

  insert into public.edospmis_quotations (tenant_id, rfq_id, supplier_id, total_cents, notes, line_prices, submitted_via)
  values (
    v_rfq.tenant_id, v_rfq.id, v_supplier_id, v_total_cents,
    nullif(trim(coalesce(p_notes, '')), ''), p_line_prices, 'supplier_portal'
  );

  return v_supplier_id;
end;
$$;

revoke all on function public.edospmis_quote_record_by_token(text, jsonb, text, text, text, text) from public;
revoke all on function public.edospmis_quote_record_by_token(text, jsonb, text, text, text, text) from anon;
revoke all on function public.edospmis_quote_record_by_token(text, jsonb, text, text, text, text) from authenticated;
grant execute on function public.edospmis_quote_record_by_token(text, jsonb, text, text, text, text) to service_role;

-- The price-only entry point, now a shim over the shared helper. Unchanged
-- behaviour: a tender that asks for no paperwork needs no signature.
create or replace function public.edospmis_submit_quotation_by_token(
  p_token text,
  p_line_prices jsonb,
  p_notes text,
  p_supplier_name text,
  p_supplier_email text,
  p_supplier_phone text
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  perform public.edospmis_quote_record_by_token(
    p_token, p_line_prices, p_notes, p_supplier_name, p_supplier_email, p_supplier_phone);

  update public.edospmis_rfq_suppliers
  set status = 'submitted', responded_at = now()
  where access_token = p_token;
end;
$$;

-- ── Prices, paperwork and signature as one act ─────────────────────────
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

  -- A pack signed under the old two-button flow, with no price ever sent.
  --
  -- Those bidders pressed "Sign and submit", were thanked, and never pressed
  -- the other button — the live system has two of them. Their submission is
  -- already signed, so there is no draft left to sign: asking for one would
  -- open an empty version 2 and then refuse it for the very documents they
  -- already supplied. Their price is taken and the invitation closed; what was
  -- signed stays signed, and no signature is rewritten after the fact.
  select exists (
    select 1 from public.edospmis_bid_submissions bs
     where bs.rfq_id = v_invite.rfq_id
       and bs.supplier_id = v_invite.supplier_id
       and bs.status = 'submitted'
  ) into v_already_signed;

  -- Refused up front rather than part-way: this runs in one transaction, so a
  -- raise here leaves nothing behind, but the bidder is better told before
  -- their prices vanish into a rollback they cannot see.
  if v_requirements > 0 and not v_already_signed
     and nullif(btrim(coalesce(p_signed_name, '')), '') is null then
    raise exception 'Type the name of the person signing.';
  end if;

  -- The price first, because the signature hashes it.
  perform public.edospmis_quote_record_by_token(
    p_token, p_line_prices, p_notes, p_supplier_name, p_supplier_email, p_supplier_phone);

  if v_requirements > 0 and not v_already_signed then
    -- Idempotent: returns the draft their uploads already created, or opens
    -- one for a tender whose requirements are all optional and were skipped.
    perform public.edospmis_bid_draft_by_token(p_token);
    -- Raises, naming what is outstanding, if anything mandatory is missing —
    -- which rolls the quotation back with it. Nothing is half-submitted.
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
