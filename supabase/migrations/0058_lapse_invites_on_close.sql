-- ──────────────────────────────────────────────────────────────────────
-- An invitation on a settled tender is not still pending.
--
-- WHAT WAS WRONG. Closing an RFQ closed the tender and left every invitation
-- on it reading 'invited' for ever. On the live system that is 12 rows across
-- 8 tenders awarded, received or paid months ago, each one still claiming to
-- be an open invitation to quote. None of them was ever even emailed — that
-- was a separate bug, fixed separately — so they were never going to move.
--
-- A STATUS, NOT A DELETION. The rows are the record of who was asked to quote
-- on what, which is the first thing anybody auditing a procurement decision
-- wants. 'lapsed' says what happened: the tender closed without this supplier
-- submitting. Whether we actually asked them is in `emailed_at`, which is why
-- that is its own column and not folded into the status.
--
-- A TRIGGER, NOT A BACKFILL. A one-off update would clear today's backlog and
-- let it rebuild from the next award onwards. This closes the hole: invitations
-- lapse at the moment the tender does, by whatever route it closed — and
-- `edospmis_award_po` has been redefined five times across five migrations, so
-- putting it there would mean copying a hundred lines of unrelated logic
-- forward a sixth time to add two.
--
-- 'submitted' IS LEFT ALONE. They responded; that is the outcome, not a lapse.
-- ──────────────────────────────────────────────────────────────────────

alter table public.edospmis_rfq_suppliers
  drop constraint if exists edospmis_rfq_suppliers_status_check;

alter table public.edospmis_rfq_suppliers
  add constraint edospmis_rfq_suppliers_status_check
  check (status in ('invited', 'viewed', 'submitted', 'declined', 'lapsed'));

create or replace function public.edospmis_lapse_rfq_invites()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.edospmis_rfq_suppliers
  set status = 'lapsed'
  where rfq_id = new.id
    and status in ('invited', 'viewed');
  return new;
end;
$$;

-- Fires only on the transition, not on every later touch of a closed RFQ:
-- without the old-status guard, an unrelated update to a closed tender would
-- re-lapse rows somebody had deliberately set back to 'invited'.
drop trigger if exists edospmis_rfqs_lapse_invites on public.edospmis_rfqs;

create trigger edospmis_rfqs_lapse_invites
  after update of status on public.edospmis_rfqs
  for each row
  when (old.status = 'open' and new.status in ('closed', 'cancelled'))
  execute function public.edospmis_lapse_rfq_invites();

-- The backlog that accumulated before the trigger existed.
update public.edospmis_rfq_suppliers i
set status = 'lapsed'
where i.status in ('invited', 'viewed')
  and exists (
    select 1 from public.edospmis_rfqs r
     where r.id = i.rfq_id and r.status in ('closed', 'cancelled')
  );
