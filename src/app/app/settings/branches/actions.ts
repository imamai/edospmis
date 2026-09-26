"use server";

import { revalidatePath } from "next/cache";
import { requireSession, can } from "@/lib/data/session";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";

export interface BranchFormState {
  error: string | null;
  ok: string | null;
}

export async function createBranch(_prev: BranchFormState, form: FormData): Promise<BranchFormState> {
  const session = await requireSession();
  if (!can(session, "admin.org.manage")) {
    return { error: "You don't have permission to manage branches.", ok: null };
  }
  const name = String(form.get("name") ?? "").trim();
  const code = String(form.get("code") ?? "").trim();
  const businessUnitId = String(form.get("business_unit_id") ?? "").trim();
  if (!name) return { error: "Give the branch a name.", ok: null };

  const supabase = await createClient();
  const { error } = await supabase.from("edospmis_branches").insert({
    tenant_id: session.tenant.id,
    name,
    code: code || null,
    business_unit_id: businessUnitId || null,
  });
  if (error) {
    return { error: error.code === "23505" ? "That branch already exists." : "Couldn't save that.", ok: null };
  }

  await logAudit({
    tenantId: session.tenant.id,
    actorId: session.user.id,
    action: "branch.created",
    entityType: "branch",
    after: { name, code, business_unit_id: businessUnitId || null },
  });

  revalidatePath("/app/settings/branches");
  return { error: null, ok: `Added ${name}.` };
}

export async function setBranchActive(branchId: string, isActive: boolean): Promise<BranchFormState> {
  const session = await requireSession();
  if (!can(session, "admin.org.manage")) {
    return { error: "You don't have permission to manage branches.", ok: null };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("edospmis_branches")
    .update({ is_active: isActive })
    .eq("id", branchId)
    .eq("tenant_id", session.tenant.id);
  if (error) return { error: "Couldn't update that branch.", ok: null };

  revalidatePath("/app/settings/branches");
  return { error: null, ok: isActive ? "Reactivated." : "Archived." };
}
