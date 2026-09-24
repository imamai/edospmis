"use server";

import { revalidatePath } from "next/cache";
import { requireSession, can } from "@/lib/data/session";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";

export interface ClientFormState {
  error: string | null;
  ok: string | null;
}

export async function createClientRecord(_prev: ClientFormState, form: FormData): Promise<ClientFormState> {
  const session = await requireSession();
  if (!can(session, "crm.client.manage")) {
    return { error: "You don't have permission to manage clients.", ok: null };
  }
  const name = String(form.get("name") ?? "").trim();
  const email = String(form.get("email") ?? "").trim() || null;
  const phone = String(form.get("phone") ?? "").trim() || null;
  if (!name) return { error: "Give the client a name.", ok: null };

  const supabase = await createClient();
  const { error } = await supabase.from("edospmis_clients").insert({ tenant_id: session.tenant.id, name, email, phone });
  if (error) return { error: "Couldn't save that client.", ok: null };

  await logAudit({
    tenantId: session.tenant.id,
    actorId: session.user.id,
    action: "client.created",
    entityType: "client",
    after: { name, email, phone },
  });

  revalidatePath("/app/settings/clients");
  return { error: null, ok: `Added ${name}.` };
}

export async function setClientActive(clientId: string, isActive: boolean): Promise<ClientFormState> {
  const session = await requireSession();
  if (!can(session, "crm.client.manage")) {
    return { error: "You don't have permission to manage clients.", ok: null };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("edospmis_clients")
    .update({ is_active: isActive })
    .eq("id", clientId)
    .eq("tenant_id", session.tenant.id);
  if (error) return { error: "Couldn't update that client.", ok: null };

  revalidatePath("/app/settings/clients");
  return { error: null, ok: isActive ? "Client reactivated." : "Client archived." };
}
