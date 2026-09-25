-- EDOSPMIS Phase 8 — AI-assisted classification/extraction, recommend-only
-- (PRD §8.18, FR-39; ARCHITECTURE.md §18 Phase 8).
--
-- Scope cuts, same honesty discipline as every prior migration:
--   - Two of FR-39's five signals — duplicate detection and SLA-breach
--     prediction — are built as plain deterministic SQL, not a model call:
--     both are genuinely explainable this way (a similarity score, a
--     historical average), work with zero configuration (no ANTHROPIC_API_KEY
--     dependency, unlike edos.ai), and a rule a requester can see the
--     reasoning for beats an opaque model call for exactly the two signals
--     PRD FR-39 already frames as pattern-matching against records that
--     already exist.
--   - PR classification and spec/document extraction (the other two of
--     FR-39's five) are a genuine model call — see src/lib/ai/suggest.ts —
--     because free text really does need a model to structure; it is
--     always a suggestion the requester reviews and applies field-by-field
--     before saving, never a write of its own. No new table stores it —
--     nothing produced by the model is persisted unless the requester
--     keeps it in the form and submits normally.
--   - Supplier matching (FR-39's fifth signal) is not built this phase —
--     it would want the same tool-scoped-query pattern edos.ai already
--     uses (see 0011_edos_ai.sql) applied to a *write* surface (auto-
--     filling an RFQ's supplier list), which is real, separate work and a
--     bigger behavioural change than a v1 "recommend-only" cut should take
--     on in the same migration as the other four.
--   - Nothing here can ever auto-decide anything with money attached, the
--     exit criterion ARCHITECTURE.md §18 sets for this phase: both
--     functions are `stable`, read-only, and return suggestions for a
--     screen to render — never called from any RPC that writes.

create extension if not exists pg_trgm with schema extensions;

-- Duplicate detection: is this request (by title) close to one already on
-- file? Called both before a PR exists (typed title only, from the new-PR
-- form) and after (from the case detail page, excluding itself).
create or replace function public.edospmis_find_similar_prs(
  p_tenant_id uuid,
  p_title text,
  p_exclude_pr_id uuid default null
)
returns table (
  pr_id uuid,
  case_id uuid,
  case_number text,
  title text,
  status text,
  similarity real,
  created_at timestamptz
)
language plpgsql
security definer
stable
set search_path = public, extensions, auth
as $$
begin
  if not public.edospmis_has_permission(p_tenant_id, 'procurement.pr.create') then
    raise exception 'You do not have permission to create requests.';
  end if;

  if p_title is null or length(trim(p_title)) < 3 then
    return;
  end if;

  return query
    select
      pr.id,
      c.id,
      c.case_number,
      pr.title,
      c.status,
      extensions.similarity(pr.title, p_title) as similarity,
      pr.created_at
    from public.edospmis_prs pr
    join public.edospmis_cases c on c.id = pr.case_id
    where pr.tenant_id = p_tenant_id
      and (p_exclude_pr_id is null or pr.id <> p_exclude_pr_id)
      and c.status not in ('rejected', 'cancelled')
      and extensions.similarity(pr.title, p_title) > 0.3
    order by similarity desc
    limit 5;
end;
$$;

grant execute on function public.edospmis_find_similar_prs(uuid, text, uuid) to authenticated;

-- SLA-breach prediction: for every pending workflow task with a due date,
-- compare time remaining to how long this stage has historically taken to
-- complete for this tenant — flags risk before the deadline passes, not
-- just after (the live badge on My Work already covers "already breached").
create or replace function public.edospmis_predict_sla_risk(p_tenant_id uuid)
returns table (
  case_id uuid,
  case_number text,
  pr_title text,
  stage_key text,
  role_name text,
  due_at timestamptz,
  minutes_remaining numeric,
  typical_minutes numeric,
  risk text
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
    with typical as (
      select wt.stage_key, avg(extract(epoch from (wt.completed_at - wt.started_at)) / 60) as typical_minutes
      from public.edospmis_workflow_tasks wt
      where wt.tenant_id = p_tenant_id and wt.status = 'completed' and wt.completed_at is not null
      group by wt.stage_key
    )
    select
      t.case_id,
      c.case_number,
      pr.title,
      t.stage_key,
      r.name,
      t.due_at,
      round((extract(epoch from (t.due_at - now())) / 60)::numeric, 0) as minutes_remaining,
      round(typ.typical_minutes::numeric, 0) as typical_minutes,
      case
        when t.due_at < now() then 'breached'
        when typ.typical_minutes is not null
          and extract(epoch from (t.due_at - now())) / 60 < typ.typical_minutes * 0.5 then 'high'
        when typ.typical_minutes is not null
          and extract(epoch from (t.due_at - now())) / 60 < typ.typical_minutes then 'medium'
        else 'low'
      end as risk
    from public.edospmis_workflow_tasks t
    join public.edospmis_cases c on c.id = t.case_id
    join public.edospmis_prs pr on pr.case_id = t.case_id
    left join public.edospmis_roles r on r.id = t.role_id
    left join typical typ on typ.stage_key = t.stage_key
    where t.tenant_id = p_tenant_id and t.status = 'pending' and t.due_at is not null
    order by minutes_remaining asc nulls last;
end;
$$;

grant execute on function public.edospmis_predict_sla_risk(uuid) to authenticated;
