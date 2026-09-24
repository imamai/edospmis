"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/data/session";
import { createClient } from "@/lib/supabase/server";

export interface DecisionState {
  error: string | null;
  ok: string | null;
}

export async function decideApproval(
  _prev: DecisionState,
  form: FormData,
): Promise<DecisionState> {
  await requireSession();
  const approvalId = String(form.get("approval_id") ?? "");
  const decision = String(form.get("decision") ?? "");
  const comment = String(form.get("comment") ?? "").trim() || null;
  const caseId = String(form.get("case_id") ?? "");

  if (!approvalId || !["approved", "rejected", "returned"].includes(decision)) {
    return { error: "Invalid decision.", ok: null };
  }
  if ((decision === "rejected" || decision === "returned") && !comment) {
    return { error: "Add a comment explaining why.", ok: null };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("edospmis_decide_approval", {
    p_approval_id: approvalId,
    p_decision: decision,
    p_comment: comment,
  });
  if (error) return { error: error.message, ok: null };

  revalidatePath(`/app/cases/${caseId}`);
  revalidatePath("/app/home");
  revalidatePath("/app/prs");

  const label = decision === "approved" ? "Approved." : decision === "rejected" ? "Rejected." : "Returned to requester.";
  return { error: null, ok: label };
}
