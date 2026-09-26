-- Fixes a real gap: when a PR is returned for correction,
-- edospmis_decide_approval already resets edospmis_prs.status back to
-- 'draft' (0003_phase2_case_pr_workflow.sql), which correctly re-enables
-- the "Submit for approval" button (case-detail page's `canSubmit`). But no
-- function has ever existed to actually change the PR's content — the only
-- write path was edospmis_create_pr (insert-only, via createPR) — so a
-- requester whose PR was returned had no way to act on the reviewer's
-- comment before resubmitting the exact same request. The
-- 'procurement.pr.edit' permission has been in the catalogue since
-- 0001/phase2 for exactly this, just never backed by a function.
--
-- Same authorization shape as edospmis_submit_pr: the requester themselves,
-- or anyone holding procurement.pr.edit, and only while status is still
-- 'draft' (covers a fresh, never-submitted draft and a returned-then-reset
-- one identically — there is no separate "correction" state to track).

create function public.edospmis_update_pr(
  p_pr_id uuid,
  p_title text,
  p_justification text,
  p_category_id uuid,
  p_client_id uuid,
  p_required_by date,
  p_priority text,
  p_items jsonb
)
returns void
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  v_pr record;
  v_estimated_cost_cents bigint;
begin
  select * into v_pr from public.edospmis_prs where id = p_pr_id for update;
  if v_pr is null then
    raise exception 'That request could not be found.';
  end if;
  if not public.edospmis_is_member(v_pr.tenant_id) then
    raise exception 'Not authorized.';
  end if;
  if v_pr.requester_id <> auth.uid() and not public.edospmis_has_permission(v_pr.tenant_id, 'procurement.pr.edit') then
    raise exception 'Only the requester, or someone who can edit requests, can edit this.';
  end if;
  if v_pr.status <> 'draft' then
    raise exception 'This request can no longer be edited — it has already been submitted.';
  end if;
  if trim(coalesce(p_title, '')) = '' then
    raise exception 'Give the request a title.';
  end if;
  if p_priority not in ('low', 'normal', 'high', 'urgent') then
    raise exception 'Invalid priority.';
  end if;

  select coalesce(sum((item->>'qty')::numeric * (item->>'estimated_unit_cost_cents')::bigint), 0)::bigint
  into v_estimated_cost_cents
  from jsonb_array_elements(p_items) as item;

  update public.edospmis_prs
  set title = trim(p_title),
      justification = nullif(trim(coalesce(p_justification, '')), ''),
      category_id = p_category_id,
      client_id = p_client_id,
      required_by = p_required_by,
      priority = p_priority,
      items = p_items,
      estimated_cost_cents = v_estimated_cost_cents
  where id = p_pr_id;

  -- client_id is denormalized onto the case too (edospmis_create_pr writes
  -- both) — getCaseDetail's clientName badge reads it from the case, not
  -- the PR, so both have to move together or the badge goes stale.
  update public.edospmis_cases set client_id = p_client_id where id = v_pr.case_id;

  insert into public.edospmis_audit_logs (tenant_id, actor_id, action, entity_type, entity_id, after)
  values (v_pr.tenant_id, auth.uid(), 'pr.updated', 'pr', p_pr_id, jsonb_build_object('case_id', v_pr.case_id));
end;
$function$;

-- Supabase grants EXECUTE on every new function to anon/authenticated/
-- service_role by default (0022's own finding) — authenticated needs to
-- keep it, anon never should.
revoke execute on function public.edospmis_update_pr(uuid, text, text, uuid, uuid, date, text, jsonb) from anon;
revoke execute on function public.edospmis_update_pr(uuid, text, text, uuid, uuid, date, text, jsonb) from public;
