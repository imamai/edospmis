-- ──────────────────────────────────────────────────────────────────────
-- Scheduling a delivery on a case that closed itself reopens it.
--
-- A BUG INTRODUCED BY 0056. That migration closes a case when the order is
-- settled and no delivery is outstanding, which cleared a real problem: fully
-- paid cases sitting at the finance stage for ever because nobody pressed
-- Close. It decided "no delivery row" meant "no delivery needed".
--
-- It can equally mean "nobody has scheduled one yet". PR-2026-000010 is
-- exactly that: paid on 2 October, closed automatically the same minute, zero
-- deliveries — and the Delivery panel still on screen, offering a Schedule
-- button that could only ever answer "This case is not ready to schedule
-- delivery yet." The goods still had to go somewhere.
--
-- This is the same shape as the bug 0030 fixed, where submitting an invoice
-- moved a case to 'finance' and locked delivery out permanently. The lesson
-- did not carry: delivery is concurrent with the money, not after it.
--
-- WHY REOPEN RATHER THAN NOT CLOSE. Refusing to auto-close any case without a
-- delivery would bring back the pile of finished cases nobody closes, which is
-- the larger problem and the commoner one. Closing on settlement is a good
-- guess; scheduling a delivery afterwards is proof the guess was wrong, and
-- the right response to a wrong guess is to undo it, not to stop guessing.
--
-- ONLY 'closed'. A rejected or cancelled case stays that way: those are
-- decisions somebody made, not a guess the system made, and nothing here
-- should quietly overturn them. The reopening gets its own audit line with a
-- reason, because a case that closes and later is open again, with no
-- explanation in between, is how somebody loses an afternoon.
-- ──────────────────────────────────────────────────────────────────────

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
  if v_case.status not in ('awarded', 'receiving', 'finance', 'delivery', 'closed') then
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
  elsif v_case.status = 'closed' then
    update public.edospmis_cases
    set status = 'delivery', current_stage_key = 'delivery', closed_at = null
    where id = p_case_id;

    insert into public.edospmis_audit_logs (tenant_id, actor_id, action, entity_type, entity_id, reason)
    values (v_case.tenant_id, auth.uid(), 'case.reopened', 'case', p_case_id,
            'Reopened to schedule a delivery. The case had closed automatically on settlement because no delivery had been scheduled.');
  end if;

  insert into public.edospmis_audit_logs (tenant_id, actor_id, action, entity_type, entity_id, after)
  values (v_case.tenant_id, auth.uid(), 'delivery.scheduled', 'delivery', v_delivery_id,
          jsonb_build_object('case_id', p_case_id, 'scheduled_at', p_scheduled_at));

  return v_delivery_id;
end;
$$;
