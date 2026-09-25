"use server";

import { revalidatePath } from "next/cache";
import { requireSession, can } from "@/lib/data/session";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";

export interface CategoryFormState {
  error: string | null;
  ok: string | null;
}

export async function createCategory(_prev: CategoryFormState, form: FormData): Promise<CategoryFormState> {
  const session = await requireSession();
  if (!can(session, "admin.org.manage")) {
    return { error: "You don't have permission to manage categories.", ok: null };
  }
  const name = String(form.get("name") ?? "").trim();
  if (!name) return { error: "Give the category a name.", ok: null };

  const supabase = await createClient();
  const { error } = await supabase.from("edospmis_categories").insert({ tenant_id: session.tenant.id, name });
  if (error) return { error: error.code === "23505" ? "That category already exists." : "Couldn't save that category.", ok: null };

  await logAudit({
    tenantId: session.tenant.id,
    actorId: session.user.id,
    action: "category.created",
    entityType: "category",
    after: { name },
  });

  revalidatePath("/app/settings/categories");
  return { error: null, ok: `Added ${name}.` };
}

export async function setCategoryActive(categoryId: string, isActive: boolean): Promise<CategoryFormState> {
  const session = await requireSession();
  if (!can(session, "admin.org.manage")) {
    return { error: "You don't have permission to manage categories.", ok: null };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("edospmis_categories")
    .update({ is_active: isActive })
    .eq("id", categoryId)
    .eq("tenant_id", session.tenant.id);
  if (error) return { error: "Couldn't update that category.", ok: null };

  revalidatePath("/app/settings/categories");
  return { error: null, ok: isActive ? "Category reactivated." : "Category archived." };
}
