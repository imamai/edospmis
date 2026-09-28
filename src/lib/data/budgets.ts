import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Placement } from "@/lib/database.types";

export interface BudgetPeriod {
  id: string;
  name: string;
  starts_on: string;
  ends_on: string;
  is_open: boolean;
}

export interface BudgetStatus {
  allocated_cents: number;
  committed_cents: number;
  pending_cents: number;
  spent_cents: number;
  available_cents: number;
}

export interface Budget extends Placement {
  id: string;
  period_id: string;
  period_name: string;
  name: string;
  code: string | null;
  category_id: string | null;
  amount_cents: number;
  currency: string;
  is_active: boolean;
}

export interface BudgetWithStatus extends Budget {
  status: BudgetStatus;
}

const ZERO: BudgetStatus = {
  allocated_cents: 0,
  committed_cents: 0,
  pending_cents: 0,
  spent_cents: 0,
  available_cents: 0,
};

export async function getBudgetPeriods(tenantId: string): Promise<BudgetPeriod[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("edospmis_budget_periods")
    .select("id, name, starts_on, ends_on, is_open")
    .eq("tenant_id", tenantId)
    .order("starts_on", { ascending: false });
  return (data ?? []) as BudgetPeriod[];
}

export async function getBudgets(tenantId: string, periodId?: string): Promise<Budget[]> {
  const supabase = await createClient();
  let query = supabase
    .from("edospmis_budgets")
    .select(
      "id, period_id, name, code, category_id, amount_cents, currency, is_active, business_unit_id, branch_id, department_id, team_id, edospmis_budget_periods(name)",
    )
    .eq("tenant_id", tenantId)
    .eq("is_active", true);
  if (periodId) query = query.eq("period_id", periodId);
  const { data } = await query.order("name");

  return (data ?? []).map((b) => {
    const period = b.edospmis_budget_periods as unknown as { name: string } | null;
    return {
      id: b.id,
      period_id: b.period_id,
      period_name: period?.name ?? "",
      name: b.name,
      code: b.code,
      category_id: b.category_id,
      amount_cents: b.amount_cents,
      currency: b.currency,
      is_active: b.is_active,
      business_unit_id: b.business_unit_id,
      branch_id: b.branch_id,
      department_id: b.department_id,
      team_id: b.team_id,
    };
  });
}

/** Allocated, committed, pending and available for one line. */
export async function getBudgetStatus(budgetId: string): Promise<BudgetStatus> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("edospmis_budget_status", { p_budget_id: budgetId });
  const row = Array.isArray(data) ? data[0] : data;
  return (row as BudgetStatus) ?? ZERO;
}

/**
 * Every line with its balance, for the admin screen.
 *
 * One call per line rather than one aggregate query, because the balance
 * involves three different joins with different filters and a single
 * statement doing all of it is a statement nobody will be able to correct
 * later. A workspace has tens of budget lines, not thousands.
 */
export async function getBudgetsWithStatus(tenantId: string, periodId?: string): Promise<BudgetWithStatus[]> {
  const budgets = await getBudgets(tenantId, periodId);
  const statuses = await Promise.all(budgets.map((b) => getBudgetStatus(b.id)));
  return budgets.map((b, i) => ({ ...b, status: statuses[i] }));
}

export interface BudgetChoice {
  id: string;
  label: string;
  currency: string;
  available_cents: number;
  allocated_cents: number;
}

/**
 * The lines a requester may charge to, each with what is left on it.
 *
 * Every open line is offered rather than only the requester's own: people
 * raise requests against a central line all the time, and a picker that hides
 * the right answer is how spend ends up on the wrong one. The placement is in
 * the label so the correct choice is obvious.
 */
export async function getBudgetChoices(tenantId: string): Promise<BudgetChoice[]> {
  const supabase = await createClient();
  const { data: periods } = await supabase
    .from("edospmis_budget_periods")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("is_open", true);

  const openPeriodIds = (periods ?? []).map((p) => p.id);
  if (openPeriodIds.length === 0) return [];

  const budgets = await getBudgets(tenantId);
  const open = budgets.filter((b) => openPeriodIds.includes(b.period_id));
  const statuses = await Promise.all(open.map((b) => getBudgetStatus(b.id)));

  return open.map((b, i) => ({
    id: b.id,
    label: b.code ? `${b.name} (${b.code})` : b.name,
    currency: b.currency,
    available_cents: statuses[i].available_cents,
    allocated_cents: statuses[i].allocated_cents,
  }));
}
