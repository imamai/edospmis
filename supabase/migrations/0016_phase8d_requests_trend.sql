-- EDOSPMIS Phase 8d — daily request-volume trendline for the Home dashboard.
-- One series (requests created per day); a fuller multi-series trend (spend,
-- completions) is real, separate work, not bundled in here.

create or replace function public.edospmis_report_requests_trend(p_tenant_id uuid, p_from timestamptz, p_to timestamptz)
returns table (day date, request_count bigint)
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
    select d.day::date, coalesce(count(pr.id), 0)::bigint
    from generate_series(date_trunc('day', p_from), date_trunc('day', p_to), interval '1 day') as d(day)
    left join public.edospmis_prs pr
      on pr.tenant_id = p_tenant_id
      and date_trunc('day', pr.created_at) = d.day
    group by d.day
    order by d.day;
end;
$$;

grant execute on function public.edospmis_report_requests_trend(uuid, timestamptz, timestamptz) to authenticated;
