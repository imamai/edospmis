-- Phase 9g — Supabase's performance advisor flagged 12 RLS policies that
-- call auth.uid() directly in their USING/WITH CHECK expression, which
-- Postgres re-evaluates per row instead of once per query. Wrapping each
-- call as (select auth.uid()) lets the planner treat it as a stable
-- sub-select evaluated once (the standard Supabase-documented fix) —
-- purely a query-plan optimization, no behavior change.

alter policy edospmis_ai_conversations_delete on public.edospmis_ai_conversations
  using (user_id = (select auth.uid()));

alter policy edospmis_ai_conversations_insert on public.edospmis_ai_conversations
  with check ((user_id = (select auth.uid())) and edospmis_is_member(tenant_id));

alter policy edospmis_ai_conversations_select on public.edospmis_ai_conversations
  using ((user_id = (select auth.uid())) and edospmis_is_member(tenant_id));

alter policy edospmis_ai_conversations_update on public.edospmis_ai_conversations
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter policy edospmis_ai_messages_insert on public.edospmis_ai_messages
  with check (exists (
    select 1 from public.edospmis_ai_conversations c
    where c.id = edospmis_ai_messages.conversation_id and c.user_id = (select auth.uid())
  ));

alter policy edospmis_ai_messages_select on public.edospmis_ai_messages
  using (exists (
    select 1 from public.edospmis_ai_conversations c
    where c.id = edospmis_ai_messages.conversation_id and c.user_id = (select auth.uid())
  ));

alter policy edospmis_memberships_select on public.edospmis_memberships
  using (edospmis_is_member(tenant_id) or user_id = (select auth.uid()));

alter policy edospmis_permissions_select on public.edospmis_permissions
  using ((select auth.uid()) is not null);

alter policy edospmis_prs_update on public.edospmis_prs
  using (
    (requester_id = (select auth.uid()) and status = 'draft'::text)
    or edospmis_has_permission(tenant_id, 'procurement.pr.edit'::text)
  )
  with check (
    (requester_id = (select auth.uid()) and status = 'draft'::text)
    or edospmis_has_permission(tenant_id, 'procurement.pr.edit'::text)
  );

alter policy edospmis_user_roles_select on public.edospmis_user_roles
  using (edospmis_is_member(tenant_id) or user_id = (select auth.uid()));

alter policy edospmis_users_select on public.edospmis_users
  using (id = (select auth.uid()) or edospmis_shares_tenant(id));

alter policy edospmis_users_update_self on public.edospmis_users
  using (id = (select auth.uid()));
