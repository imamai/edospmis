"use server";

import { revalidatePath } from "next/cache";
import { requireSession, can } from "@/lib/data/session";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";

export interface SupplierFormState {
  error: string | null;
  ok: string | null;
}

export async function createSupplier(
  _prev: SupplierFormState,
  form: FormData,
): Promise<SupplierFormState> {
  const session = await requireSession();
  if (!can(session, "procurement.supplier.manage")) {
    return {
      error: "You don't have permission to manage suppliers.",
      ok: null,
    };
  }
  const name = String(form.get("name") ?? "").trim();
  const email = String(form.get("email") ?? "").trim() || null;
  const phone = String(form.get("phone") ?? "").trim() || null;
  if (!name) return { error: "Give the supplier a name.", ok: null };

  const supabase = await createClient();
  const { error } = await supabase
    .from("edospmis_suppliers")
    .insert({ tenant_id: session.tenant.id, name, email, phone });
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

export async function setSupplierActive(
  supplierId: string,
  isActive: boolean,
): Promise<SupplierFormState> {
  const session = await requireSession();
  if (!can(session, "procurement.supplier.manage")) {
    return {
      error: "You don't have permission to manage suppliers.",
      ok: null,
    };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("edospmis_suppliers")
    .update({ is_active: isActive })
    .eq("id", supplierId)
    .eq("tenant_id", session.tenant.id);
  if (error) return { error: "Couldn't update that supplier.", ok: null };

  revalidatePath("/app/settings/suppliers");
  return {
    error: null,
    ok: isActive ? "Supplier reactivated." : "Supplier archived.",
  };
}

/**
 * Correcting a supplier's details.
 *
 * Added because they could not be corrected at all: a supplier could be
 * created and archived, never edited. One real invitation bounced off
 * `edoscentre.coke` — a missing dot — and the only remedy on offer was to
 * archive the row and type the whole supplier again, orphaning their history
 * on the old record.
 *
 * The audit entry carries `before` as well as `after`. A changed email is
 * exactly the kind of edit somebody will later need to account for: it
 * redirects where tender invitations land.
 */
export async function updateSupplier(
  _prev: SupplierFormState,
  form: FormData,
): Promise<SupplierFormState> {
  const session = await requireSession();
  if (!can(session, "procurement.supplier.manage")) {
    return {
      error: "You don't have permission to manage suppliers.",
      ok: null,
    };
  }
  const id = String(form.get("id") ?? "");
  const name = String(form.get("name") ?? "").trim();
  const email = String(form.get("email") ?? "").trim() || null;
  const phone = String(form.get("phone") ?? "").trim() || null;
  if (!id)
    return { error: "Couldn't tell which supplier to update.", ok: null };
  if (!name) return { error: "Give the supplier a name.", ok: null };

  const supabase = await createClient();

  // Read first, so the audit trail can say what the address used to be. The
  // tenant filter is on the read as well as the write: it decides whether
  // this row is ours to touch at all.
  const { data: before } = await supabase
    .from("edospmis_suppliers")
    .select("name, email, phone")
    .eq("id", id)
    .eq("tenant_id", session.tenant.id)
    .maybeSingle();
  if (!before) return { error: "Couldn't find that supplier.", ok: null };

  const { error } = await supabase
    .from("edospmis_suppliers")
    .update({ name, email, phone })
    .eq("id", id)
    .eq("tenant_id", session.tenant.id);
  if (error) return { error: "Couldn't save those changes.", ok: null };

  await logAudit({
    tenantId: session.tenant.id,
    actorId: session.user.id,
    action: "supplier.updated",
    entityType: "supplier",
    entityId: id,
    before,
    after: { name, email, phone },
  });

  revalidatePath("/app/settings/suppliers");
  revalidatePath(`/app/settings/suppliers/${id}`);
  return { error: null, ok: `Saved ${name}.` };
}
