-- EDOSPMIS edos.ai — the same assistant every EDOS Centre sibling app
-- (edos-poa, edoshatch360) ships, brought to this product.
--
-- Architecture carried over on purpose from the siblings: a tool-calling
-- loop against the Anthropic Messages API, where the model never touches
-- the database directly — each tool is a calculation/lookup already scoped
-- to the tenant, so it cannot be made to quote a figure this tenant's own
-- data doesn't hold. Switched on by ANTHROPIC_API_KEY; without one the
-- assistant says so plainly rather than pretending to answer.
--
-- Where this deliberately does NOT copy the siblings:
--   - Conversation storage uses EDOSPMIS's own established pattern —
--     RLS policies keyed on auth.uid(), like every other table in this
--     app — rather than edos-poa's "RLS on, no policies, service-role
--     only" arrangement. Consistency within this codebase wins over
--     matching a sibling's differing internal choice.
--   - No "load everything once into memory" data layer — EDOSPMIS's
--     tools query on demand per call, which suits enterprise-shaped
--     relational data (RLS-scoped joins) better than a POS's small,
--     preloaded dataset.
--   - No deterministic natural-language fallback matcher (the sibling
--     apps' "answers of last resort" when no API key is configured) —
--     replicating that breadth is real, separate work; without a model
--     configured, edos.ai says so and points at the Reports screen
--     (Phase 6) instead of guessing.

create table public.edospmis_ai_conversations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.edospmis_tenants (id) on delete cascade,
  user_id uuid not null references public.edospmis_users (id) on delete cascade,
  title text not null default 'New conversation',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.edospmis_ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.edospmis_ai_conversations (id) on delete cascade,
  tenant_id uuid not null references public.edospmis_tenants (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  body text not null,
  -- What the answer was worked out from, kept with it so a reply read back
  -- later can still be traced to the figures that produced it.
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index edospmis_ai_conversations_owner_idx on public.edospmis_ai_conversations (tenant_id, user_id, updated_at desc);
create index edospmis_ai_messages_thread_idx on public.edospmis_ai_messages (conversation_id, created_at);

alter table public.edospmis_ai_conversations enable row level security;
alter table public.edospmis_ai_messages enable row level security;

create policy edospmis_ai_conversations_select on public.edospmis_ai_conversations
  for select using (user_id = auth.uid() and public.edospmis_is_member(tenant_id));
create policy edospmis_ai_conversations_insert on public.edospmis_ai_conversations
  for insert with check (user_id = auth.uid() and public.edospmis_is_member(tenant_id));
create policy edospmis_ai_conversations_update on public.edospmis_ai_conversations
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy edospmis_ai_conversations_delete on public.edospmis_ai_conversations
  for delete using (user_id = auth.uid());

create policy edospmis_ai_messages_select on public.edospmis_ai_messages
  for select using (
    exists (select 1 from public.edospmis_ai_conversations c where c.id = conversation_id and c.user_id = auth.uid())
  );
create policy edospmis_ai_messages_insert on public.edospmis_ai_messages
  for insert with check (
    exists (select 1 from public.edospmis_ai_conversations c where c.id = conversation_id and c.user_id = auth.uid())
  );
