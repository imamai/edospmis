import "server-only";

import { createClient } from "@/lib/supabase/server";

interface LogAuditInput {
  tenantId: string;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
}

/**
 * Writes one row to edospmis_audit_logs. Best-effort: a failed audit write
 * never blocks the mutation it's describing — it only gets logged to the
 * server console for someone to notice, same as the pattern proven in
 * edoshatch360's lib/audit.ts.
 */
export async function logAudit(input: LogAuditInput): Promise<void> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("edospmis_audit_logs").insert({
      tenant_id: input.tenantId,
      actor_id: input.actorId,
      action: input.action,
      entity_type: input.entityType,
      entity_id: input.entityId ?? null,
      before: input.before ?? null,
      after: input.after ?? null,
      reason: input.reason ?? null,
    });
    if (error) console.error("logAudit failed:", error.message, input);
  } catch (err) {
    console.error("logAudit threw:", err, input);
  }
}
