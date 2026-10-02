-- ──────────────────────────────────────────────────────────────────────
-- The bell tells you, instead of waiting to be asked.
--
-- The bell is rendered by the server layout, so its contents were fixed at
-- page load: an approval raised while somebody sat on a case appeared only
-- when they next navigated or pressed refresh. For the one feature whose
-- entire job is to say "something needs you now", that is the wrong way
-- round — the people who most need it are the ones who leave a case open.
--
-- PUSH, NOT POLLING. Polling every few seconds would mean a query per user
-- per tick all day to deliver a handful of rows, most ticks finding nothing.
-- This table already has the one thing that makes push safe: a row-level
-- policy of user_id = auth.uid(). Realtime enforces that same policy per
-- subscriber, so a socket can only ever carry rows that person could already
-- read, and the browser is told rather than asking.
--
-- ONLY THIS TABLE. The publication was empty, and it stays nearly so on
-- purpose: every table added to it streams every change to anyone entitled to
-- see it, for ever. Notifications are small, already per-user, and exist to be
-- delivered the moment they are written. Cases and invoices are none of those.
--
-- REPLICA IDENTITY FULL is needed for the UPDATE stream to carry user_id in
-- the old row, which is what the subscriber filters on. Without it, marking a
-- notification read elsewhere — another tab, a phone — would not reach this
-- one, and the count would disagree between two screens of the same person.
-- The row is a handful of short columns; the extra WAL is not worth avoiding.
-- ──────────────────────────────────────────────────────────────────────

alter table public.edospmis_notifications replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'edospmis_notifications'
  ) then
    alter publication supabase_realtime add table public.edospmis_notifications;
  end if;
end $$;
