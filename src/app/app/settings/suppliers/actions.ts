"use server";

import { revalidatePath } from "next/cache";
import { requireSession, can } from "@/lib/data/session";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";

export interface SupplierFormState {
  error: string | null;
  ok: string | null;
}

export async function createSupplier(_prev: SupplierFormState, form: FormData): Promise<SupplierFormState> {
  const session = await requireSession();
  if (!can(session, "procurement.supplier.manage")) {
    return { error: "You don't have permission to manage suppliers.", ok: null };
  }
  const name = String(form.get("name") ?? "").trim();
  const email = String(form.get("email") ?? "").trim() || null;
  const phone = String(form.get("phone") ?? "").trim() || null;
  if (!name) return { error: "Give the supplier a name.", ok: null };

  const supabase = await createClient();
  const { error } = await supabase.from("edospmis_suppliers").insert({ tenant_id: session.tenant.id, name, email, phone });
  if (error) return { error: "Couldn't save that supplier.", ok: null };

  await logAudit({
    tenantId: session.tenant.id,
    actorId: session.user.id,
    action: "supplier.created",
    entityType: "supplier",
    after: { name, email, phone },
  });

  revalidatePath("/app/settings/suppliers");
  return { error: null, ok: `Added ${name}.` };
}

export async function setSupplierActive(supplierId: string, isActive: boolean): Promise<SupplierFormState> {
  const session = await requireSession();
  if (!can(session, "procurement.supplier.manage")) {
    return { error: "You don't have permission to manage suppliers.", ok: null };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("edospmis_suppliers")
    .update({ is_active: isActive })
    .eq("id", supplierId)
    .eq("tenant_id", session.tenant.id);
  if (error) return { error: "Couldn't update that supplier.", ok: null };

  revalidatePath("/app/settings/suppliers");
  return { error: null, ok: isActive ? "Supplier reactivated." : "Supplier archived." };
}
