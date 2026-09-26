"use server";

import { revalidatePath } from "next/cache";
import { requireSession, can } from "@/lib/data/session";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";

// Queues are gated on admin.workflows.manage, not admin.org.manage like the
// other four org-structure pages — don't copy-paste the wrong key here.
const PERMISSION = "admin.workflows.manage";

export interface QueueFormState {
  error: string | null;
  ok: string | null;
}

export async function createQueue(_prev: QueueFormState, form: FormData): Promise<QueueFormState> {
  const session = await requireSession();
  if (!can(session, PERMISSION)) {
    return { error: "You don't have permission to manage queues.", ok: null };
  }
  const name = String(form.get("name") ?? "").trim();
  const stageKey = String(form.get("stage_key") ?? "").trim();
  const assignmentStrategy = String(form.get("assignment_strategy") ?? "role").trim();
  if (!name) return { error: "Give the queue a name.", ok: null };
  if (!stageKey) return { error: "Pick which stage this queue serves.", ok: null };

  const supabase = await createClient();
  const { error } = await supabase.from("edospmis_queues").insert({
    tenant_id: session.tenant.id,
    name,
    stage_key: stageKey,
    assignment_strategy: assignmentStrategy || "role",
  });
  if (error) {
    return {
      error: error.code === "23505" ? "A queue already exists for that stage." : "Couldn't save that queue.",
      ok: null,
    };
  }

  await logAudit({
    tenantId: session.tenant.id,
    actorId: session.user.id,
    action: "queue.created",
    entityType: "queue",
    after: { name, stage_key: stageKey, assignment_strategy: assignmentStrategy },
  });

  revalidatePath("/app/settings/queues");
  return { error: null, ok: `Added ${name}.` };
}

export async function deleteQueue(queueId: string): Promise<QueueFormState> {
  const session = await requireSession();
  if (!can(session, PERMISSION)) {
    return { error: "You don't have permission to manage queues.", ok: null };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("edospmis_queues")
    .delete()
    .eq("id", queueId)
    .eq("tenant_id", session.tenant.id);
  if (error) return { error: "Couldn't delete that queue.", ok: null };

  revalidatePath("/app/settings/queues");
  return { error: null, ok: "Deleted." };
}
