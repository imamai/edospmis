-- EDOSPMIS Phase 6 — Reporting/Analytics (PRD §8.17, FR-38).
--
-- Scope cuts, same honesty discipline as every prior migration:
--   - No new tables. Every report here is a read-only aggregation over
--     data the platform already writes as a side effect of normal use —
--     case_stage_history (Flow Alignment), workflow_tasks, GRNs/GRN items,
--     POs, PRs/categories. Nothing is pre-computed or scheduled; each
--     function runs live, which is fine at this data volume and avoids a
--     whole materialized-view refresh/staleness problem for a v1.
--   - SLA compliance is computed for whichever stage_key actually has an
--     `edospmis_sla_policies` row and a completed workflow_task — today
--     that's 'approval' only, same as everywhere else in the app; it
--     generalizes automatically the day a tenant adds more policies.
--   - Supplier performance's "accepted item rate" and "average days from
--     award to first GRN" are the two supplier signals ARCHITECTURE.md's
--     FR-25 asks for that are cheaply, honestly derivable from data that
--     already exists — a fuller weighted scorecard is real, separate work.
--   - "Department spend" is reported as spend-by-category instead:
--     `department_id` exists on cases/PRs but is essentially never
--     populated (no UI sets it yet), while `category_id` is populated on
--     every PR and, as of the flow-alignment audit, now reflects each
--     tenant's real vocabulary — reporting against data that actually
--     exists beats reporting an always-empty group.
--   - PR aging is a live query, not a stored function — it's a single
--     un-aggregated SELECT ordered by age, no aggregation to push into SQL.

create or replace function public.edospmis_report_stage_durations(p_tenant_id uuid)
returns table (stage_key text, cases_seen bigint, currently_in bigint, avg_minutes numeric)
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
    select
      h.stage_key,
      count(*)::bigint as cases_seen,
      count(*) filter (where h.left_at is null)::bigint as currently_in,
      avg(extract(epoch from (coalesce(h.left_at, now()) - h.entered_at)) / 60)::numeric as avg_minutes
    from public.edospmis_case_stage_history h
    where h.tenant_id = p_tenant_id
    group by h.stage_key;
end;
$$;

create or replace function public.edospmis_report_sla_compliance(p_tenant_id uuid)
returns table (stage_key text, total bigint, on_time bigint, breached bigint)
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
    select
      t.stage_key,
      count(*)::bigint as total,
      count(*) filter (where t.completed_at <= t.due_at)::bigint as on_time,
      count(*) filter (where t.completed_at > t.due_at)::bigint as breached
    from public.edospmis_workflow_tasks t
    where t.tenant_id = p_tenant_id and t.status = 'completed' and t.due_at is not null and t.completed_at is not null
    group by t.stage_key;
end;
$$;

create or replace function public.edospmis_report_supplier_performance(p_tenant_id uuid)
returns table (
  supplier_id uuid,
  supplier_name text,
  po_count bigint,
  total_cents bigint,
  accepted_items bigint,
  total_items bigint,
  avg_days_award_to_grn numeric
)
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
    with po_stats as (
      select po.supplier_id, count(*)::bigint as po_count, coalesce(sum(po.total_cents), 0)::bigint as total_cents
      from public.edospmis_purchase_orders po
      where po.tenant_id = p_tenant_id
      group by po.supplier_id
    ),
    grn_stats as (
      select po.supplier_id,
             count(gi.*) filter (where gi.condition = 'accepted')::bigint as accepted_items,
             count(gi.*)::bigint as total_items
      from public.edospmis_purchase_orders po
      join public.edospmis_grns g on g.po_id = po.id
      join public.edospmis_grn_items gi on gi.grn_id = g.id
      where po.tenant_id = p_tenant_id
      group by po.supplier_id
    ),
    lead_time as (
      select po.supplier_id,
             avg(extract(epoch from (first_grn.received_at - po.issued_at)) / 86400) as avg_days
      from public.edospmis_purchase_orders po
      join lateral (
        select g.received_at from public.edospmis_grns g
        where g.po_id = po.id order by g.received_at asc limit 1
      ) first_grn on true
      where po.tenant_id = p_tenant_id
      group by po.supplier_id
    )
    select s.id, s.name,
           coalesce(po_stats.po_count, 0),
           coalesce(po_stats.total_cents, 0),
           coalesce(grn_stats.accepted_items, 0),
           coalesce(grn_stats.total_items, 0),
           lead_time.avg_days
    from public.edospmis_suppliers s
    left join po_stats on po_stats.supplier_id = s.id
    left join grn_stats on grn_stats.supplier_id = s.id
    left join lead_time on lead_time.supplier_id = s.id
    where s.tenant_id = p_tenant_id and coalesce(po_stats.po_count, 0) > 0;
end;
$$;

create or replace function public.edospmis_report_spend_by_category(p_tenant_id uuid)
returns table (category_name text, pr_count bigint, total_estimated_cents bigint)
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
    select coalesce(c.name, 'Uncategorized') as category_name,
           count(pr.*)::bigint as pr_count,
           coalesce(sum(pr.estimated_cost_cents), 0)::bigint as total_estimated_cents
    from public.edospmis_prs pr
    left join public.edospmis_categories c on c.id = pr.category_id
    where pr.tenant_id = p_tenant_id
    group by c.name
    order by sum(pr.estimated_cost_cents) desc nulls last;
end;
$$;
