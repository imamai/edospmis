"use server";

import { revalidatePath } from "next/cache";
import { requireSession, can } from "@/lib/data/session";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";

export interface DepartmentFormState {
  error: string | null;
  ok: string | null;
}

export async function createDepartment(_prev: DepartmentFormState, form: FormData): Promise<DepartmentFormState> {
  const session = await requireSession();
  if (!can(session, "admin.org.manage")) {
    return { error: "You don't have permission to manage departments.", ok: null };
  }
  const name = String(form.get("name") ?? "").trim();
  const code = String(form.get("code") ?? "").trim();
  const branchId = String(form.get("branch_id") ?? "").trim();
  const businessUnitId = String(form.get("business_unit_id") ?? "").trim();
  if (!name) return { error: "Give the department a name.", ok: null };

  const supabase = await createClient();
  const { error } = await supabase.from("edospmis_departments").insert({
    tenant_id: session.tenant.id,
    name,
    code: code || null,
    branch_id: branchId || null,
    business_unit_id: businessUnitId || null,
  });
  if (error) {
    return { error: error.code === "23505" ? "That department already exists." : "Couldn't save that.", ok: null };
  }

  await logAudit({
    tenantId: session.tenant.id,
    actorId: session.user.id,
    action: "department.created",
    entityType: "department",
    after: { name, code, branch_id: branchId || null, business_unit_id: businessUnitId || null },
  });

  revalidatePath("/app/settings/departments");
  return { error: null, ok: `Added ${name}.` };
}

export async function setDepartmentActive(departmentId: string, isActive: boolean): Promise<DepartmentFormState> {
  const session = await requireSession();
  if (!can(session, "admin.org.manage")) {
    return { error: "You don't have permission to manage departments.", ok: null };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("edospmis_departments")
    .update({ is_active: isActive })
    .eq("id", departmentId)
    .eq("tenant_id", session.tenant.id);
  if (error) return { error: "Couldn't update that department.", ok: null };

  revalidatePath("/app/settings/departments");
  return { error: null, ok: isActive ? "Reactivated." : "Archived." };
}
