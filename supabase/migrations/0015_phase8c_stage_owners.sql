-- EDOSPMIS Phase 8c — "Who typically handles this stage?" (follow-up to the
-- Time in each stage report).
--
-- Two genuinely different kinds of answer, not one:
--   - 'approval' is the one stage built as a formal role-routed chain
--     (edospmis_workflow_tasks.role_id, set in 0003/0008's
--     edospmis_submit_pr / edospmis_decide_approval) — real historical data,
--     which roles actually held tasks there, not a guess.
--   - Every other stage has no stored "assigned role"; it's gated by
--     whoever holds the permission for that stage's own defining action at
--     the moment they act. Each mapping below was checked against the exact
--     RPC that performs it, not assumed:
--       draft            -> procurement.pr.create   (the requester who owns the draft)
--       approved         -> procurement.rfq.create  (edospmis_start_procurement, 0005)
--       procurement      -> procurement.po.issue    (edospmis_award_po, 0005/0009)
--       po_approval      -> procurement.po.approve  (edospmis_approve_po, 0009)
--       awarded          -> receiving.grn.create    (edospmis_record_grn, 0007)
--       receiving        -> receiving.grn.approve   (edospmis_record_inspection, 0007) —
--                           note receiving's own *exit* actually forks to either
--                           edospmis_schedule_delivery (delivery.assign) or
--                           edospmis_submit_invoice (finance.invoice.create)
--                           depending on which happens first; inspection is what
--                           "handling this stage" means day to day, so that's
--                           what's shown, not one arbitrarily-picked exit branch.
--       finance          -> finance.invoice.approve (edospmis_approve_invoice, 0008)
--       delivery         -> delivery.complete       (edospmis_confirm_delivery, 0007)
--   - submitted/approved-terminal/rejected/returned/cancelled/closed are
--     transient or terminal states with no distinct "owner" role and are
--     left out — a null/absent row, not a fabricated one.

create or replace function public.edospmis_stage_owners(p_tenant_id uuid)
returns table (stage_key text, role_names text[])
language plpgsql
security definer
stable
set search_path = public, auth
as $$
begin
  if not public.edospmis_has_permission(p_tenant_id, 'reports.view') then
    raise exception 'You do not have permission to view reports.';
  end if;

  return query
    select 'approval'::text, array_agg(distinct r.name order by r.name)
    from public.edospmis_workflow_tasks wt
    join public.edospmis_roles r on r.id = wt.role_id
    where wt.tenant_id = p_tenant_id and wt.stage_key = 'approval'
    group by wt.stage_key

  union all

  select m.stage_key, array_agg(distinct r.name order by r.name)
  from (
    values
      ('draft', 'procurement.pr.create'),
      ('approved', 'procurement.rfq.create'),
      ('procurement', 'procurement.po.issue'),
      ('po_approval', 'procurement.po.approve'),
      ('awarded', 'receiving.grn.create'),
      ('receiving', 'receiving.grn.approve'),
      ('finance', 'finance.invoice.approve'),
      ('delivery', 'delivery.complete')
  ) as m(stage_key, perm_key)
  join public.edospmis_permissions p on p.key = m.perm_key
  join public.edospmis_role_permissions rp on rp.permission_id = p.id
  join public.edospmis_roles r on r.id = rp.role_id and r.tenant_id = p_tenant_id
  -- Tenant Administrator holds every permission by definition — true for
  -- every stage, so showing it everywhere is noise, not a real answer to
  -- "who typically handles this."
  where r.name <> 'Tenant Administrator'
  group by m.stage_key;
end;
$$;

grant execute on function public.edospmis_stage_owners(uuid) to authenticated;
