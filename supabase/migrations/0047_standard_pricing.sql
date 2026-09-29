-- One price list across every EDOS product. See the matching migration in
-- EDOS CRM (0020_standard_pricing.sql) for the full reasoning.
--
--   Starter  4,499/month   up to 5 users
--   Growth   7,499/month   up to 20 users
--   Pro     11,499/month   unlimited
--
-- Onboarding is quoted per organisation, never published.
--
-- EDOSPMIS previously published 4,500 / 7,500 / 10,000, while the quotations
-- actually sent carried 11,499 a month. The subscription is levelled here; the
-- design and development charge is not published at all, since it varies with
-- the plan and the migration involved. A quotation already issued stands at the
-- figure it was given — a quotation is a price given, not a price looked up.
--
-- Amounts are VAT-exclusive. Existing subscriptions reference plan_id, which
-- does not change, so nobody is re-billed for a period already paid.

update public.edospmis_plans
   set price_cents          = 449900,
       max_users            = 5
 where code = 'starter';

update public.edospmis_plans
   set price_cents          = 749900,
       max_users            = 20
 where code = 'growth';

update public.edospmis_plans
   set price_cents          = 1149900,
       max_users            = null
 where code = 'pro';
--
-- Onboarding is NOT published. `onboarding_fee_cents` stays null, which this
-- schema already defines as "quoted per organisation rather than published".
-- What the work costs depends on the plan taken and on what the customer is
-- carrying across, and neither is known until we have spoken to them — so it
-- is agreed with the customer and put in writing before they commit. A
-- published figure would be wrong for most of them.
