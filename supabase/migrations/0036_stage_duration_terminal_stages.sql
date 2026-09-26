-- "Time in each stage" was still counting for stages a case never leaves.
--
-- The average was computed as `coalesce(left_at, now()) - entered_at`. For a
-- case genuinely sitting in Approval that's correct — it has been waiting that
-- long. But a case's final stage history row never gets a `left_at`, because
-- there is no next stage to move to. So Completed, Rejected and Cancelled were
-- accruing time forever, and the report showed "Completed — 1.2d avg" for work
-- that had actually finished. That figure was measuring how long ago cases
-- closed, not how long anything took, and it grew every time the page loaded.
--
-- Two changes:
--
--  1. Terminal stages (closed / rejected / cancelled) report no duration at
--     all. `avg_minutes` is null for them — there is no dwell time to measure,
--     and a null is honest where a growing number was actively misleading.
--
--  2. For every other stage the average is taken over *completed* passes only
--     (`left_at is not null`) — how long the stage actually took when work
--     moved through it. A pass still in progress no longer drags the average
--     up simply because time is passing; those cases are already reported
--     separately as `currently_in`, and now also as `open_avg_minutes` so a
--     stage with something stuck in it still says so.
--
-- `cases_seen` and `currently_in` are unchanged.

-- Postgres won't let `create or replace` change a function's return type, and
-- this adds a column to the returned table, so the old one goes first.
drop function if exists public.edospmis_report_stage_durations(uuid, timestamptz, timestamptz);

create function public.edospmis_report_stage_durations(
  p_tenant_id uuid,
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns table (
  stage_key text,
  cases_seen bigint,
  currently_in bigint,
  avg_minutes numeric,
  open_avg_minutes numeric
)
language plpgsql
stable
security definer
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
      -- Completed passes only, and never for a stage with no exit.
      case
        when h.stage_key in ('closed', 'rejected', 'cancelled') then null
        else avg(extract(epoch from (h.left_at - h.entered_at)) / 60) filter (
          where h.left_at is not null
            and h.entered_at >= coalesce(p_from, '-infinity'::timestamptz)
            and h.entered_at <= coalesce(p_to, 'infinity'::timestamptz)
        )
      end::numeric as avg_minutes,
      -- How long the ones sitting here right now have been waiting.
      case
        when h.stage_key in ('closed', 'rejected', 'cancelled') then null
        else avg(extract(epoch from (now() - h.entered_at)) / 60) filter (where h.left_at is null)
      end::numeric as open_avg_minutes
    from public.edospmis_case_stage_history h
    where h.tenant_id = p_tenant_id
    group by h.stage_key;
end;
$$;

revoke execute on function public.edospmis_report_stage_durations(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.edospmis_report_stage_durations(uuid, timestamptz, timestamptz) to authenticated;
