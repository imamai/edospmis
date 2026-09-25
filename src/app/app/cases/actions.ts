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

export interface CaseActionState {
  error: string | null;
  ok: string | null;
}

export async function cancelCase(caseId: string, reason: string): Promise<CaseActionState> {
  await requireSession();
  const supabase = await createClient();
  const { error } = await supabase.rpc("edospmis_cancel_case", { p_case_id: caseId, p_reason: reason || null });
  if (error) return { error: error.message, ok: null };
  revalidatePath(`/app/cases/${caseId}`);
  return { error: null, ok: "Case cancelled." };
}

export async function setCaseHold(caseId: string, onHold: boolean, reason: string): Promise<CaseActionState> {
  await requireSession();
  const supabase = await createClient();
  const { error } = await supabase.rpc("edospmis_set_case_hold", { p_case_id: caseId, p_on_hold: onHold, p_reason: reason || null });
  if (error) return { error: error.message, ok: null };
  revalidatePath(`/app/cases/${caseId}`);
  return { error: null, ok: onHold ? "Case put on hold." : "Hold released." };
}

export async function setCaseBlocked(caseId: string, blocked: boolean, reason: string): Promise<CaseActionState> {
  await requireSession();
  const supabase = await createClient();
  const { error } = await supabase.rpc("edospmis_set_case_blocked", { p_case_id: caseId, p_blocked: blocked, p_reason: reason || null });
  if (error) return { error: error.message, ok: null };
  revalidatePath(`/app/cases/${caseId}`);
  return { error: null, ok: blocked ? "Case marked blocked." : "Block cleared." };
}
