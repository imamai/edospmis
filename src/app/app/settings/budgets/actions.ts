"use server";

import { revalidatePath } from "next/cache";
import { requireSession, can } from "@/lib/data/session";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";

export interface BudgetFormState {
  error: string | null;
  ok: string | null;
}

/** "1,250,000" or "1250000.50" → cents. Null where it is not a number. */
function parseAmountCents(raw: string): number | null {
  const cleaned = raw.replace(/[,\s]/g, "");
  if (!cleaned) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

export async function createBudgetPeriod(
  _prev: BudgetFormState,
  form: FormData,
): Promise<BudgetFormState> {
  const session = await requireSession();
  if (!can(session, "admin.org.manage")) {
    return { error: "You don't have permission to manage budgets.", ok: null };
  }

  const name = String(form.get("name") ?? "").trim();
  const startsOn = String(form.get("starts_on") ?? "");
  const endsOn = String(form.get("ends_on") ?? "");
  if (!name || !startsOn || !endsOn) return { error: "Give the period a name and both dates.", ok: null };
  if (endsOn <= startsOn) return { error: "The period has to end after it starts.", ok: null };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("edospmis_budget_periods")
    .insert({ tenant_id: session.tenant.id, name, starts_on: startsOn, ends_on: endsOn })
    .select("id")
    .single();

  if (error || !data) return { error: "Couldn't create that period. Try again.", ok: null };

  await logAudit({
    tenantId: session.tenant.id,
    actorId: session.user.id,
    action: "budget_period.created",
    entityType: "budget_period",
    entityId: data.id,
    after: { name, starts_on: startsOn, ends_on: endsOn },
  });

  revalidatePath("/app/settings/budgets");
  return { error: null, ok: `${name} created.` };
}

export async function createBudget(_prev: BudgetFormState, form: FormData): Promise<BudgetFormState> {
  const session = await requireSession();
  if (!can(session, "admin.org.manage")) {
    return { error: "You don't have permission to manage budgets.", ok: null };
  }

  const periodId = String(form.get("period_id") ?? "");
  const name = String(form.get("name") ?? "").trim();
  const code = String(form.get("code") ?? "").trim() || null;
  const categoryId = String(form.get("category_id") ?? "") || null;
  const amountCents = parseAmountCents(String(form.get("amount") ?? ""));

  // Only the deepest level is sent; migration 0044's trigger derives the rest.
  const teamId = String(form.get("team_id") ?? "") || null;
  const departmentId = String(form.get("department_id") ?? "") || null;

  if (!periodId) return { error: "Choose the period this line belongs to.", ok: null };
  if (!name) return { error: "Give the line a name.", ok: null };
  if (amountCents === null) return { error: "Enter the amount as a number.", ok: null };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("edospmis_budgets")
    .insert({
      tenant_id: session.tenant.id,
      period_id: periodId,
      name,
      code,
      category_id: categoryId,
      amount_cents: amountCents,
      team_id: teamId,
      department_id: teamId ? null : departmentId,
    })
    .select("id")
    .single();

  if (error || !data) {
    // The placement trigger raises a readable message for a department or
    // team from another workspace; pass it through rather than flattening it.
    return { error: error?.message ?? "Couldn't create that budget line. Try again.", ok: null };
  }

  await logAudit({
    tenantId: session.tenant.id,
    actorId: session.user.id,
    action: "budget.created",
    entityType: "budget",
    entityId: data.id,
    after: { name, amount_cents: amountCents, period_id: periodId },
  });

  revalidatePath("/app/settings/budgets");
  return { error: null, ok: `${name} created.` };
}
