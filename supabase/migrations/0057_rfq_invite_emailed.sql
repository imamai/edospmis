-- ──────────────────────────────────────────────────────────────────────
-- Recording that an invitation was actually sent, not merely created.
--
-- THE BUG THIS CLOSES. Inviting a supplier inserted a row with status
-- 'invited' and sent nothing; the mail went only when somebody separately
-- clicked Email on that supplier's row. Both states rendered as the same
-- "invited" badge, so a supplier nobody had written to was indistinguishable
-- on screen from one who had read the mail. The buying team waited for
-- quotations from people who had never been asked.
--
-- Checked against the live send log before writing this: of every quotation
-- invitation ever created, two had mail sent — one delivered, one bounced on
-- a mistyped address. The rest were silent.
--
-- WHY A COLUMN AND NOT A STATUS. 'invited' → 'viewed' → 'submitted' tracks
-- what the SUPPLIER has done. Whether we managed to email them is a fact
-- about us, and it stays true after they move on to 'viewed': squeezing it
-- into the status would lose it at the first transition.
--
-- NULL IS THE HONEST DEFAULT for rows created before this migration. It means
-- "no send recorded", which for historical rows is exactly the truth — we
-- cannot now tell whether one of those two sends belongs to a given row, and
-- guessing would be worse than admitting it.
-- ──────────────────────────────────────────────────────────────────────

alter table public.edospmis_rfq_suppliers
  add column if not exists emailed_at timestamptz;

comment on column public.edospmis_rfq_suppliers.emailed_at is
  'When the invitation email was last accepted by the mail provider. Null means no send has been recorded — including for every row created before this column existed. Acceptance is not delivery: a bounce can follow.';
