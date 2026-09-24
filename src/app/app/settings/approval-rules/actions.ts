"use server";

import { revalidatePath } from "next/cache";
import { requireSession, can } from "@/lib/data/session";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";

export interface RuleFormState {
  error: string | null;
  ok: string | null;
}

export async function createApprovalRule(_prev: RuleFormState, form: FormData): Promise<RuleFormState> {
  const session = await requireSession();
  if (!can(session, "admin.approvals.manage")) {
    return { error: "You don't have permission to manage approval rules.", ok: null };
  }

  const name = String(form.get("name") ?? "").trim();
  const minRaw = String(form.get("min_amount") ?? "").trim();
  const maxRaw = String(form.get("max_amount") ?? "").trim();
  const roleIds = (form.getAll("role_id") as string[]).filter(Boolean);
  if (!name) return { error: "Give the rule a name.", ok: null };
  if (roleIds.length === 0) return { error: "Add at least one approval step.", ok: null };

  const minAmountCents = minRaw ? Math.round(Number(minRaw) * 100) : null;
  const maxAmountCents = maxRaw ? Math.round(Number(maxRaw) * 100) : null;
  if (minAmountCents !== null && maxAmountCents !== null && minAmountCents > maxAmountCents) {
    return { error: "The minimum amount can't be more than the maximum.", ok: null };
  }

  const supabase = await createClient();
  const { data: rule, error } = await supabase
    .from("edospmis_approval_rules")
    .insert({ tenant_id: session.tenant.id, name, min_amount_cents: minAmountCents, max_amount_cents: maxAmountCents })
    .select("id")
    .single();
  if (error || !rule) return { error: "Couldn't create that rule.", ok: null };

  const { error: stepsError } = await supabase.from("edospmis_approval_steps").insert(
    roleIds.map((role_id, i) => ({ rule_id: rule.id, step_order: i + 1, role_id })),
  );
  if (stepsError) return { error: "Rule created, but its steps couldn't be saved.", ok: null };

  await logAudit({
    tenantId: session.tenant.id,
    actorId: session.user.id,
    action: "approval_rule.created",
    entityType: "approval_rule",
    entityId: rule.id,
    after: { name, minAmountCents, maxAmountCents, roleIds },
  });

  revalidatePath("/app/settings/approval-rules");
  return { error: null, ok: `Created "${name}".` };
}

export async function setApprovalRuleActive(ruleId: string, isActive: boolean): Promise<RuleFormState> {
  const session = await requireSession();
  if (!can(session, "admin.approvals.manage")) {
    return { error: "You don't have permission to manage approval rules.", ok: null };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("edospmis_approval_rules")
    .update({ is_active: isActive })
    .eq("id", ruleId)
    .eq("tenant_id", session.tenant.id);
  if (error) return { error: "Couldn't update that rule.", ok: null };

  await logAudit({
    tenantId: session.tenant.id,
    actorId: session.user.id,
    action: isActive ? "approval_rule.activated" : "approval_rule.deactivated",
    entityType: "approval_rule",
    entityId: ruleId,
  });

  revalidatePath("/app/settings/approval-rules");
  return { error: null, ok: isActive ? "Rule activated." : "Rule deactivated." };
}
