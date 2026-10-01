-- ──────────────────────────────────────────────────────────────────────
-- An item catalogue, so a requester picks instead of typing.
--
-- Every requisition line was free text. That is fine for one request and
-- corrosive across a thousand: "HP Laptop 14in", "hp laptop 14 inch" and
-- "Laptop HP 14\"" are the same purchase and three different rows, so spend
-- by item cannot be reported, a duplicate request cannot be spotted, and the
-- same thing is quoted at a different price each quarter because nobody can
-- see what it cost last time.
--
-- A tenant loads what it buys once — from the spreadsheet it already keeps,
-- see lib/import/spreadsheet.ts — and requesters choose from it. Free text
-- stays allowed, deliberately: the first request for something new must not
-- be blocked waiting for an administrator to add a catalogue row. The
-- catalogue is a shortcut and a vocabulary, not a gate.
--
-- `code` is the tenant's own part number where it has one. Unique per tenant
-- when present, so re-importing the same spreadsheet updates rows instead of
-- duplicating them — which is what makes a monthly price-list refresh safe.
-- ──────────────────────────────────────────────────────────────────────

create table if not exists public.edospmis_catalogue_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.edospmis_tenants(id) on delete cascade,
  -- The tenant's own part or stock number. Optional: plenty of businesses
  -- have none, and demanding one would stop the import they actually have.
  code text,
  description text not null,
  unit text not null default 'pcs',
  -- What it usually costs, for pre-filling an estimate. Explicitly indicative:
  -- the real price comes from a quotation, and this figure must never be
  -- mistaken for one. Nullable because a catalogue with no prices is still
  -- worth having for the names alone.
  indicative_unit_cost_cents bigint check (indicative_unit_cost_cents is null or indicative_unit_cost_cents >= 0),
  currency text not null default 'KES',
  category_id uuid references public.edospmis_categories(id) on delete set null,
  -- Where the row came from, so an administrator can tell a bulk import from
  -- a hand-typed entry when a price looks wrong.
  source text not null default 'manual' check (source in ('manual', 'import')),
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Re-importing a price list has to update, not duplicate. Partial, because
-- `code` is optional and several rows legitimately have none.
create unique index if not exists edospmis_catalogue_items_tenant_code_idx
  on public.edospmis_catalogue_items(tenant_id, lower(code))
  where code is not null;

create index if not exists edospmis_catalogue_items_tenant_active_idx
  on public.edospmis_catalogue_items(tenant_id, is_active);

-- The picker searches as somebody types, over description and code together.
create index if not exists edospmis_catalogue_items_search_idx
  on public.edospmis_catalogue_items
  using gin (to_tsvector('simple', coalesce(description, '') || ' ' || coalesce(code, '')));

comment on column public.edospmis_catalogue_items.indicative_unit_cost_cents is
  'Typical cost, for pre-filling an estimate. Not a quoted price and not a '
  'commitment — the price that counts comes from a supplier quotation.';

-- ── Which requisition line came from the catalogue ────────────────────
--
-- Recorded on the line rather than inferred by matching text later, because
-- matching text later is exactly the problem the catalogue exists to end.
-- Nullable: a free-text line has no catalogue row, and that stays allowed.

alter table public.edospmis_prs
  add column if not exists catalogue_item_ids uuid[];

comment on column public.edospmis_prs.catalogue_item_ids is
  'Catalogue row behind each item line, positionally — null where the '
  'requester typed their own. Lets spend be reported by item without '
  're-matching free text, which is what the catalogue exists to avoid.';

-- ── Row-level security ────────────────────────────────────────────────
--
-- Any member may read it: a catalogue nobody can see is a catalogue nobody
-- can pick from. Maintaining it is a procurement job, not a general one — a
-- wrong unit or a stale price here reaches every future request.

alter table public.edospmis_catalogue_items enable row level security;

drop policy if exists edospmis_catalogue_items_select on public.edospmis_catalogue_items;
create policy edospmis_catalogue_items_select on public.edospmis_catalogue_items
  for select using (public.edospmis_is_member(tenant_id));

drop policy if exists edospmis_catalogue_items_write on public.edospmis_catalogue_items;
create policy edospmis_catalogue_items_write on public.edospmis_catalogue_items
  for all using (public.edospmis_has_permission(tenant_id, 'procurement.catalogue.manage'))
  with check (public.edospmis_has_permission(tenant_id, 'procurement.catalogue.manage'));

grant select on public.edospmis_catalogue_items to authenticated;
grant insert, update, delete on public.edospmis_catalogue_items to authenticated;

-- ── The permission ────────────────────────────────────────────────────

insert into public.edospmis_permissions (key, category, description) values
  ('procurement.catalogue.manage', 'procurement', 'Maintain the item catalogue')
on conflict (key) do nothing;

-- New tenants pick this up automatically: provisioning grants Procurement
-- Manager everything matching 'procurement.%', and Tenant Administrator
-- everything. Tenants that already exist were provisioned before this key
-- existed, so they are granted it here — otherwise the feature ships switched
-- off for every current customer and looks broken rather than new.
insert into public.edospmis_role_permissions (role_id, permission_id)
select r.id, p.id
from public.edospmis_roles r
cross join public.edospmis_permissions p
where p.key = 'procurement.catalogue.manage'
  and r.name in ('Tenant Administrator', 'Procurement Manager')
on conflict (role_id, permission_id) do nothing;

-- ── Bulk import, in one statement ─────────────────────────────────────
--
-- A spreadsheet of a few thousand rows sent one insert at a time is a few
-- thousand round trips, and a failure halfway leaves a half-loaded
-- catalogue. This takes the parsed rows as jsonb and applies them in a single
-- transaction: all of it lands, or none of it does.
--
-- Rows carrying a `code` update the matching row. Rows without one are
-- appended, because there is nothing to match them on — two hand-typed lines
-- reading "cleaning supplies" are not provably the same item, and silently
-- merging them would lose one.
--
-- security invoker: the caller's own permission decides, through the policy
-- above, rather than this function handing out a way around it.

create or replace function public.edospmis_import_catalogue(
  p_tenant_id uuid,
  p_rows jsonb
)
returns table (inserted int, updated int)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_inserted int := 0;
  v_updated int := 0;
  v_row jsonb;
  v_code text;
  v_existing uuid;
begin
  if not public.edospmis_has_permission(p_tenant_id, 'procurement.catalogue.manage') then
    raise exception 'Not allowed to maintain the catalogue for this workspace';
  end if;

  for v_row in select * from jsonb_array_elements(p_rows)
  loop
    -- An empty description is not an item. Skipped rather than rejected: a
    -- spreadsheet's trailing blank rows should not fail an otherwise good
    -- import.
    continue when coalesce(trim(v_row->>'description'), '') = '';

    v_code := nullif(trim(coalesce(v_row->>'code', '')), '');
    v_existing := null;

    if v_code is not null then
      select id into v_existing
      from public.edospmis_catalogue_items
      where tenant_id = p_tenant_id and lower(code) = lower(v_code);
    end if;

    if v_existing is not null then
      update public.edospmis_catalogue_items
         set description = trim(v_row->>'description'),
             unit = coalesce(nullif(trim(coalesce(v_row->>'unit', '')), ''), unit),
             -- A price column left blank keeps what is already there, so a
             -- partial list does not wipe prices it never mentioned.
             indicative_unit_cost_cents = coalesce(
               (v_row->>'indicative_unit_cost_cents')::bigint,
               indicative_unit_cost_cents
             ),
             notes = coalesce(nullif(trim(coalesce(v_row->>'notes', '')), ''), notes),
             source = 'import',
             is_active = true,
             updated_at = now()
       where id = v_existing;
      v_updated := v_updated + 1;
    else
      insert into public.edospmis_catalogue_items
        (tenant_id, code, description, unit, indicative_unit_cost_cents, notes, source)
      values (
        p_tenant_id,
        v_code,
        trim(v_row->>'description'),
        coalesce(nullif(trim(coalesce(v_row->>'unit', '')), ''), 'pcs'),
        (v_row->>'indicative_unit_cost_cents')::bigint,
        nullif(trim(coalesce(v_row->>'notes', '')), ''),
        'import'
      );
      v_inserted := v_inserted + 1;
    end if;
  end loop;

  return query select v_inserted, v_updated;
end;
$$;

revoke all on function public.edospmis_import_catalogue(uuid, jsonb) from public;
revoke all on function public.edospmis_import_catalogue(uuid, jsonb) from anon;
grant execute on function public.edospmis_import_catalogue(uuid, jsonb) to authenticated;
