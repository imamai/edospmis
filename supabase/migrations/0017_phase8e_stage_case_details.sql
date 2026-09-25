-- Phase 8e: per-case drill-down for the "Time in each stage" report — lets a
-- user click a stage row and see the individual cases that make up its
-- average, instead of only the aggregate number.

create or replace function public.edospmis_stage_cases(
  p_tenant_id uuid,
  p_stage_key text,
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns table (
  case_id uuid,
  case_number text,
  title text,
  priority text,
  entered_at timestamptz,
  left_at timestamptz,
  minutes_in_stage numeric,
  still_in_stage boolean
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
    select
      c.id as case_id,
      c.case_number,
      coalesce(pr.title, '(untitled)') as title,
      c.priority,
      h.entered_at,
      h.left_at,
      (extract(epoch from (coalesce(h.left_at, now()) - h.entered_at)) / 60)::numeric as minutes_in_stage,
      h.left_at is null as still_in_stage
    from public.edospmis_case_stage_history h
    join public.edospmis_cases c on c.id = h.case_id
    left join public.edospmis_prs pr on pr.case_id = c.id
    where h.tenant_id = p_tenant_id
      and h.stage_key = p_stage_key
      and h.entered_at >= coalesce(p_from, '-infinity'::timestamptz)
      and h.entered_at <= coalesce(p_to, 'infinity'::timestamptz)
    order by h.entered_at desc
    limit 200;
end;
$$;

grant execute on function public.edospmis_stage_cases(uuid, text, timestamptz, timestamptz) to authenticated;
