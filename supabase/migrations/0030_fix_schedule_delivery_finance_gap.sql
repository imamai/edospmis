-- Phase 11b — edospmis_schedule_delivery only allowed case status
-- 'awarded'/'receiving'/'delivery', but edospmis_submit_invoice moves a
-- case straight from 'awarded'/'receiving' to 'finance' the moment an
-- invoice is submitted. Since nothing else ever transitions a case out of
-- 'finance' into 'delivery', submitting an invoice before scheduling a
-- delivery permanently locked a case out of ever scheduling one — the UI
-- kept showing "Schedule delivery" (poIssued stays true through finance),
-- but every attempt failed with "This case is not ready to schedule
-- delivery yet." Delivery and invoicing are legitimately concurrent
-- concerns, not a strict sequence, so 'finance' is added to both the
-- allowed-status check and the stage-transition trigger below.

create or replace function public.edospmis_schedule_delivery(p_case_id uuid, p_scheduled_at timestamptz, p_notes text)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_case record;
  v_delivery_id uuid;
begin
  select * into v_case from public.edospmis_cases where id = p_case_id;
  if v_case is null then
    raise exception 'That case could not be found.';
  end if;
  if not public.edospmis_has_permission(v_case.tenant_id, 'delivery.assign') then
    raise exception 'You do not have permission to schedule a delivery.';
  end if;
  if v_case.status not in ('awarded', 'receiving', 'finance', 'delivery') then
    raise exception 'This case is not ready to schedule delivery yet.';
  end if;

  insert into public.edospmis_deliveries (tenant_id, case_id, scheduled_at, notes, created_by)
  values (v_case.tenant_id, p_case_id, p_scheduled_at, p_notes, auth.uid())
  on conflict (case_id) do update
    set scheduled_at = excluded.scheduled_at, notes = excluded.notes
    where public.edospmis_deliveries.status = 'scheduled'
  returning id into v_delivery_id;

  if v_delivery_id is null then
    raise exception 'This case''s delivery has already moved past scheduling.';
  end if;

  if v_case.status in ('awarded', 'receiving', 'finance') then
    update public.edospmis_cases
    set status = 'delivery', current_stage_key = 'delivery'
    where id = p_case_id;
  end if;

  insert into public.edospmis_audit_logs (tenant_id, actor_id, action, entity_type, entity_id, after)
  values (v_case.tenant_id, auth.uid(), 'delivery.scheduled', 'delivery', v_delivery_id,
          jsonb_build_object('case_id', p_case_id, 'scheduled_at', p_scheduled_at));

  return v_delivery_id;
end;
$$;
