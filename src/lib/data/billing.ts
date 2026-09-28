import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Payment, Plan, PlanCode, Subscription } from "@/lib/plans";

/**
 * Reading the price list and what a workspace is on.
 *
 * `getPlans()` is deliberately readable without a session — the public
 * pricing page calls it before anybody has signed in, and RLS on
 * `edospmis_plans` allows exactly that and nothing else. The subscription and
 * its payments are behind membership and `admin.org.manage` respectively, in
 * the database rather than here.
 *
 * All three are memoised per request with React `cache()`, so the landing
 * page rendering the price list twice costs one query.
 */

type PlanRow = {
  id: string;
  code: string;
  name: string;
  tagline: string | null;
  price_cents: number;
  currency: string;
  billing_period: string;
  onboarding_fee_cents: number | null;
  max_users: number | null;
  features: unknown;
  is_popular: boolean;
  sort_order: number;
};

function toPlan(row: PlanRow): Plan {
  return {
    id: row.id,
    code: row.code as PlanCode,
    name: row.name,
    tagline: row.tagline,
    priceCents: Number(row.price_cents),
    currency: row.currency,
    billingPeriod: row.billing_period === "year" ? "year" : "month",
    onboardingFeeCents:
      row.onboarding_fee_cents === null ? null : Number(row.onboarding_fee_cents),
    maxUsers: row.max_users,
    features: Array.isArray(row.features) ? (row.features as string[]) : [],
    isPopular: row.is_popular,
    sortOrder: row.sort_order,
  };
}

export const getPlans = cache(async (): Promise<Plan[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("edospmis_plans")
    .select(
      "id, code, name, tagline, price_cents, currency, billing_period, onboarding_fee_cents, max_users, features, is_popular, sort_order",
    )
    .eq("is_active", true)
    .order("sort_order");

  return ((data ?? []) as PlanRow[]).map(toPlan);
});

export const getSubscription = cache(async (tenantId: string): Promise<Subscription | null> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("edospmis_subscriptions")
    .select(
      "plan_id, status, trial_ends_at, current_period_end, started_at, plan:edospmis_plans!inner(code, name, price_cents)",
    )
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!data) return null;

  // PostgREST types an embedded one-to-one as an array; it is one row.
  const plan = (Array.isArray(data.plan) ? data.plan[0] : data.plan) as {
    code: string;
    name: string;
    price_cents: number;
  };

  return {
    planId: data.plan_id as string,
    planCode: plan.code as PlanCode,
    planName: plan.name,
    priceCents: Number(plan.price_cents),
    status: data.status as Subscription["status"],
    trialEndsAt: data.trial_ends_at as string | null,
    currentPeriodEnd: data.current_period_end as string | null,
    startedAt: data.started_at as string,
  };
});

export const getSubscriptionPayments = cache(async (tenantId: string): Promise<Payment[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("edospmis_subscription_payments")
    .select(
      "id, kind, provider, reference, amount_cents, currency, months, covers_from, covers_to, note, paid_at",
    )
    .eq("tenant_id", tenantId)
    .order("paid_at", { ascending: false })
    .limit(50);

  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: row.id as string,
    kind: row.kind as Payment["kind"],
    provider: row.provider as Payment["provider"],
    reference: (row.reference as string | null) ?? null,
    amountCents: Number(row.amount_cents),
    currency: row.currency as string,
    months: (row.months as number | null) ?? null,
    coversFrom: (row.covers_from as string | null) ?? null,
    coversTo: (row.covers_to as string | null) ?? null,
    note: (row.note as string | null) ?? null,
    paidAt: row.paid_at as string,
  }));
});
