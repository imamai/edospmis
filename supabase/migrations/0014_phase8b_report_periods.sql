-- EDOSPMIS Phase 8b — Report period filters (Today/This week/This month/
-- This year/Custom), matching the period-filter pattern edos-poa's own
-- dashboard/reports already use.
--
-- Each report function gains two optional `p_from`/`p_to` timestamptz
-- params, both defaulting to null (= all-time, today's exact behaviour) —
-- an existing caller that passes only `p_tenant_id` keeps working. Signature
-- arity changed, so the old 1-arg overload is dropped first (the same
-- lesson learned the hard way on edospmis_award_po in 0009).
--
-- "Right now" facts — currently_in, at-risk prediction, open-requests aging —
-- stay unfiltered by period: an open case is open regardless of which week
-- you're looking at, and SLA risk is inherently about this instant, not a
-- date range. Only the historical aggregates (cases seen, avg duration, SLA
-- outcomes, supplier spend, PR spend) are period-scoped.

drop function if exists public.edospmis_report_stage_durations(uuid);
drop function if exists public.edospmis_report_sla_compliance(uuid);
drop function if exists public.edospmis_report_supplier_performance(uuid);
drop function if exists public.edospmis_report_spend_by_category(uuid);

create or replace function public.edospmis_report_stage_durations(p_tenant_id uuid, p_from timestamptz default null, p_to timestamptz default null)
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
      count(*) filter (
        where h.entered_at >= coalesce(p_from, '-infinity'::timestamptz)
          and h.entered_at <= coalesce(p_to, 'infinity'::timestamptz)
      )::bigint as cases_seen,
      count(*) filter (where h.left_at is null)::bigint as currently_in,
      avg(extract(epoch from (coalesce(h.left_at, now()) - h.entered_at)) / 60) filter (
        where h.entered_at >= coalesce(p_from, '-infinity'::timestamptz)
          and h.entered_at <= coalesce(p_to, 'infinity'::timestamptz)
      )::numeric as avg_minutes
    from public.edospmis_case_stage_history h
    where h.tenant_id = p_tenant_id
    group by h.stage_key;
end;
$$;

create or replace function public.edospmis_report_sla_compliance(p_tenant_id uuid, p_from timestamptz default null, p_to timestamptz default null)
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
      and t.completed_at >= coalesce(p_from, '-infinity'::timestamptz)
      and t.completed_at <= coalesce(p_to, 'infinity'::timestamptz)
    group by t.stage_key;
end;
$$;

create or replace function public.edospmis_report_supplier_performance(p_tenant_id uuid, p_from timestamptz default null, p_to timestamptz default null)
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
        and po.issued_at >= coalesce(p_from, '-infinity'::timestamptz)
        and po.issued_at <= coalesce(p_to, 'infinity'::timestamptz)
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
        and po.issued_at >= coalesce(p_from, '-infinity'::timestamptz)
        and po.issued_at <= coalesce(p_to, 'infinity'::timestamptz)
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
        and po.issued_at >= coalesce(p_from, '-infinity'::timestamptz)
        and po.issued_at <= coalesce(p_to, 'infinity'::timestamptz)
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

create or replace function public.edospmis_report_spend_by_category(p_tenant_id uuid, p_from timestamptz default null, p_to timestamptz default null)
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
      and pr.created_at >= coalesce(p_from, '-infinity'::timestamptz)
      and pr.created_at <= coalesce(p_to, 'infinity'::timestamptz)
    group by c.name
    order by sum(pr.estimated_cost_cents) desc nulls last;
end;
$$;
