-- ──────────────────────────────────────────────────────────────────────
-- A case closes itself once the delivery is confirmed.
--
-- Confirming delivery marked the delivery confirmed and left the case sitting
-- at the delivery stage, waiting for somebody to press Close. Nobody presses
-- Close. The work is finished, the person who finished it has moved on, and
-- the pipeline fills with cases that are done in every sense except the one
-- the dashboard counts.
--
-- Confirming delivery *is* the completion of the work, so it closes the case.
--
-- Deliberately not gated on `procurement.case.close`. That permission exists
-- for a discretionary act — closing something early, abandoning it — and a
-- delivery officer confirming a delivery is not exercising discretion, they
-- are reporting that the thing arrived. Requiring the permission would mean
-- the last step of the workflow could only be taken by somebody who is not
-- doing the work.
--
-- Closing early by hand stays exactly as it was, permission and all; this
-- only removes the need to do it on the ordinary path.
-- ──────────────────────────────────────────────────────────────────────

create or replace function public.edospmis_confirm_delivery(
  p_delivery_id uuid,
  p_proof_type text,
  p_proof_ref text,
  p_notes text
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_delivery record;
  v_case record;
begin
  select * into v_delivery from public.edospmis_deliveries where id = p_delivery_id;
  if v_delivery is null then
    raise exception 'That delivery could not be found.';
  end if;
  if not public.edospmis_has_permission(v_delivery.tenant_id, 'delivery.complete') then
    raise exception 'You do not have permission to complete a delivery.';
  end if;
  if v_delivery.status <> 'dispatched' then
    raise exception 'This delivery must be dispatched before it can be confirmed.';
  end if;

  update public.edospmis_deliveries
  set status = 'confirmed', delivered_at = now(), client_confirmed_at = now(),
      proof_type = p_proof_type, proof_ref = p_proof_ref,
      notes = coalesce(nullif(p_notes, ''), notes)
  where id = p_delivery_id;

  insert into public.edospmis_audit_logs (tenant_id, actor_id, action, entity_type, entity_id, after)
  values (v_delivery.tenant_id, auth.uid(), 'delivery.confirmed', 'delivery', p_delivery_id,
          jsonb_build_object('case_id', v_delivery.case_id, 'proof_type', p_proof_type));

  -- ── and the case is finished ────────────────────────────────────────
  --
  -- There is one delivery per case (edospmis_deliveries has a unique on
  -- case_id), so confirming it is the last thing that happens. Guarded
  -- against a case that somebody already closed, rejected or cancelled by
  -- hand in the meantime — those outcomes stand, and must not be quietly
  -- overwritten with "closed".

  select * into v_case from public.edospmis_cases where id = v_delivery.case_id;

  if v_case.status not in ('closed', 'rejected', 'returned', 'cancelled') then
    update public.edospmis_cases
    set status = 'closed', current_stage_key = 'closed', closed_at = now()
    where id = v_delivery.case_id;

    -- Recorded as its own event with a reason, so the audit trail says why
    -- this closed and that no person decided it. A close with no actor and no
    -- explanation is the kind of entry that costs somebody an afternoon.
    insert into public.edospmis_audit_logs (tenant_id, actor_id, action, entity_type, entity_id, reason)
    values (v_delivery.tenant_id, auth.uid(), 'case.closed', 'case', v_delivery.case_id,
            'Closed automatically when the delivery was confirmed.');
  end if;
end;
$$;

revoke all on function public.edospmis_confirm_delivery(uuid, text, text, text) from public;
revoke all on function public.edospmis_confirm_delivery(uuid, text, text, text) from anon;
grant execute on function public.edospmis_confirm_delivery(uuid, text, text, text) to authenticated;
