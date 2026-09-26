"use server";

import { revalidatePath } from "next/cache";
import { requireSession, can } from "@/lib/data/session";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";

export interface TeamFormState {
  error: string | null;
  ok: string | null;
}

export async function createTeam(_prev: TeamFormState, form: FormData): Promise<TeamFormState> {
  const session = await requireSession();
  if (!can(session, "admin.org.manage")) {
    return { error: "You don't have permission to manage teams.", ok: null };
  }
  const name = String(form.get("name") ?? "").trim();
  const departmentId = String(form.get("department_id") ?? "").trim();
  if (!name) return { error: "Give the team a name.", ok: null };

  const supabase = await createClient();
  const { error } = await supabase.from("edospmis_teams").insert({
    tenant_id: session.tenant.id,
    name,
    department_id: departmentId || null,
  });
  if (error) {
    return { error: error.code === "23505" ? "That team already exists." : "Couldn't save that.", ok: null };
  }

  await logAudit({
    tenantId: session.tenant.id,
    actorId: session.user.id,
    action: "team.created",
    entityType: "team",
    after: { name, department_id: departmentId || null },
  });

  revalidatePath("/app/settings/teams");
  return { error: null, ok: `Added ${name}.` };
}

export async function setTeamActive(teamId: string, isActive: boolean): Promise<TeamFormState> {
  const session = await requireSession();
  if (!can(session, "admin.org.manage")) {
    return { error: "You don't have permission to manage teams.", ok: null };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("edospmis_teams")
    .update({ is_active: isActive })
    .eq("id", teamId)
    .eq("tenant_id", session.tenant.id);
  if (error) return { error: "Couldn't update that team.", ok: null };

  revalidatePath("/app/settings/teams");
  return { error: null, ok: isActive ? "Reactivated." : "Archived." };
}
