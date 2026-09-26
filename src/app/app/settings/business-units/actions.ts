"use server";

import { revalidatePath } from "next/cache";
import { requireSession, can } from "@/lib/data/session";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";

export interface BusinessUnitFormState {
  error: string | null;
  ok: string | null;
}

export async function createBusinessUnit(
  _prev: BusinessUnitFormState,
  form: FormData,
): Promise<BusinessUnitFormState> {
  const session = await requireSession();
  if (!can(session, "admin.org.manage")) {
    return { error: "You don't have permission to manage business units.", ok: null };
  }
  const name = String(form.get("name") ?? "").trim();
  const code = String(form.get("code") ?? "").trim();
  if (!name) return { error: "Give the business unit a name.", ok: null };

  const supabase = await createClient();
  const { error } = await supabase
    .from("edospmis_business_units")
    .insert({ tenant_id: session.tenant.id, name, code: code || null });
  if (error) {
    return { error: error.code === "23505" ? "That business unit already exists." : "Couldn't save that.", ok: null };
  }

  await logAudit({
    tenantId: session.tenant.id,
    actorId: session.user.id,
    action: "business_unit.created",
    entityType: "business_unit",
    after: { name, code },
  });

  revalidatePath("/app/settings/business-units");
  return { error: null, ok: `Added ${name}.` };
}

export async function setBusinessUnitActive(businessUnitId: string, isActive: boolean): Promise<BusinessUnitFormState> {
  const session = await requireSession();
  if (!can(session, "admin.org.manage")) {
    return { error: "You don't have permission to manage business units.", ok: null };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("edospmis_business_units")
    .update({ is_active: isActive })
    .eq("id", businessUnitId)
    .eq("tenant_id", session.tenant.id);
  if (error) return { error: "Couldn't update that business unit.", ok: null };

  revalidatePath("/app/settings/business-units");
  return { error: null, ok: isActive ? "Reactivated." : "Archived." };
}
