-- ──────────────────────────────────────────────────────────────────────
-- VAT, as a setting rather than something retyped on every invoice.
--
-- The tax box on an invoice started at zero and was typed by hand. On a
-- 16% VAT invoice that is a multiplication somebody does in their head,
-- every time, under time pressure — and a tax figure that is wrong by a
-- rounding is a tax figure that does not reconcile at the end of the quarter.
--
-- So the rate lives on the tenant and the invoice form works it out. Stored
-- as a real column rather than inside `branding` because this is not branding:
-- it is a number the finance module reads, and burying it in a jsonb blob
-- called branding is how a setting becomes impossible to find.
--
-- Two separate things on purpose. `vat_enabled` is whether this organisation
-- charges VAT at all — a business below the registration threshold does not,
-- and for them a tax box permanently showing 16% is wrong, not merely
-- unhelpful. `vat_rate` is what that rate is, so the day it changes it is one
-- field and not a release.
--
-- Defaulted on at 16%: that is the Kenyan standard rate and the overwhelming
-- case for the organisations using this. An existing tenant keeps whatever
-- its invoices already say, because the rate only ever pre-fills a form — it
-- never rewrites an invoice that was already submitted.
-- ──────────────────────────────────────────────────────────────────────

alter table public.edospmis_tenants
  add column if not exists vat_enabled boolean not null default true,
  add column if not exists vat_rate numeric(5, 2) not null default 16.00
    check (vat_rate >= 0 and vat_rate <= 100);

comment on column public.edospmis_tenants.vat_enabled is
  'Whether this organisation charges VAT. Off for one below the registration '
  'threshold, where a tax box pre-filled with a rate would be wrong rather '
  'than merely unhelpful.';

comment on column public.edospmis_tenants.vat_rate is
  'The rate as a percentage, 16.00 being the Kenyan standard. Pre-fills the '
  'tax on a new invoice; never rewrites one already submitted.';
