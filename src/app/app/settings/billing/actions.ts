"use server";

import { revalidatePath } from "next/cache";
import { requireSession, can } from "@/lib/data/session";
import { createClient } from "@/lib/supabase/server";
import type { PlanCode } from "@/lib/plans";

export interface BillingState {
  error: string | null;
  ok: string | null;
}

/**
 * Both actions re-check the permission here and the database re-checks it
 * again inside the SECURITY DEFINER function. That is deliberate duplication:
 * this one produces a sentence somebody can read, and that one is the control
 * that actually holds when a request does not come through this form.
 */

export async function choosePlan(_prev: BillingState, form: FormData): Promise<BillingState> {
  const session = await requireSession();
  if (!can(session, "admin.org.manage")) {
    return { error: "Only an administrator can change the plan.", ok: null };
  }

  const code = String(form.get("plan_code") ?? "") as PlanCode;
  if (!code) return { error: "Pick a plan.", ok: null };

  const supabase = await createClient();
  const { error } = await supabase.rpc("edospmis_set_plan", {
    p_tenant_id: session.tenant.id,
    p_plan_code: code,
  });

  if (error) return { error: error.message.replace(/^edospmis: /, ""), ok: null };

  revalidatePath("/app/settings/billing");
  return { error: null, ok: "Plan updated." };
}

export async function recordPayment(_prev: BillingState, form: FormData): Promise<BillingState> {
  const session = await requireSession();
  if (!can(session, "admin.org.manage")) {
    return { error: "Only an administrator can record a payment.", ok: null };
  }

  const kind = String(form.get("kind") ?? "subscription");
  const amount = Number(String(form.get("amount") ?? "").replace(/[^\d.]/g, ""));
  const months = Number(form.get("months") ?? 1);

  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: "Enter the amount that was paid.", ok: null };
  }
  if (kind === "subscription" && (!Number.isFinite(months) || months < 1)) {
    return { error: "Say how many months this payment covers.", ok: null };
  }

  const paidAt = String(form.get("paid_at") ?? "").trim();

  const supabase = await createClient();
  const { error } = await supabase.rpc("edospmis_record_subscription_payment", {
    p_tenant_id: session.tenant.id,
    p_plan_code: String(form.get("plan_code") ?? "") || null,
    p_kind: kind,
    p_provider: String(form.get("provider") ?? "mpesa"),
    p_reference: String(form.get("reference") ?? ""),
    // Shillings in the form, cents in the column — the rounding happens here
    // rather than in SQL so a half-cent can never reach the ledger.
    p_amount_cents: Math.round(amount * 100),
    p_months: kind === "subscription" ? months : null,
    p_paid_at: paidAt ? new Date(paidAt).toISOString() : null,
    p_note: String(form.get("note") ?? ""),
  });

  if (error) return { error: error.message.replace(/^edospmis: /, ""), ok: null };

  revalidatePath("/app/settings/billing");
  revalidatePath("/app");
  return {
    error: null,
    ok:
      kind === "onboarding"
        ? "Onboarding payment recorded."
        : "Payment recorded — the paid period has been extended.",
  };
}
