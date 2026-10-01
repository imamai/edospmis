"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/data/session";
import {
  caseContext,
  notifyRole,
  notifyUser,
  resolveNotifications,
} from "@/lib/notify/notifications";
import { createClient } from "@/lib/supabase/server";

export interface DecisionState {
  error: string | null;
  ok: string | null;
}

export async function decideApproval(
  _prev: DecisionState,
  form: FormData,
): Promise<DecisionState> {
  const session = await requireSession();
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

  // One of four approvers acted, so the other three stop being asked.
  await resolveNotifications(caseId, "pr.submitted");

  const { data: pr } = await supabase
    .from("edospmis_prs")
    .select("requester_id, title, edospmis_cases(case_number)")
    .eq("case_id", caseId)
    .maybeSingle();

  const row = pr as unknown as {
    requester_id: string;
    title: string;
    edospmis_cases: { case_number: string } | { case_number: string }[] | null;
  } | null;
  const caseNumber = Array.isArray(row?.edospmis_cases)
    ? row?.edospmis_cases[0]?.case_number
    : row?.edospmis_cases?.case_number;
  const caseLabel = caseNumber ?? "Your request";

  if (row) {
    // The requester hears every outcome. Returned is the one that matters
    // most: from their side it looks exactly like one still being considered,
    // so without this the work simply stops.
    await notifyUser({
      tenantId: session.tenant.id,
      userId: row.requester_id,
      caseId,
      kind: `pr.${decision}`,
      title:
        decision === "approved"
          ? `${caseLabel} was approved`
          : decision === "rejected"
            ? `${caseLabel} was rejected`
            : `${caseLabel} was returned for correction`,
      body: comment ?? undefined,
      href: `/app/cases/${caseId}`,
    });
  }

  if (decision === "approved") {
    // Blocks: nothing happens until procurement picks it up.
    await notifyRole({
      tenantId: session.tenant.id,
      caseId,
      kind: "pr.approved",
      title: `${caseLabel} is approved and ready to source`,
      body: row?.title,
      href: `/app/cases/${caseId}`,
      permission: "procurement.rfq.create",
      blocks: true,
      tenantName: session.tenant.name,
    });
  }

  revalidatePath(`/app/cases/${caseId}`);
  revalidatePath("/app/home");
  revalidatePath("/app/prs");

  const label =
    decision === "approved"
      ? "Approved."
      : decision === "rejected"
        ? "Rejected."
        : "Returned to requester.";
  return { error: null, ok: label };
}

export interface CaseActionState {
  error: string | null;
  ok: string | null;
}

export async function cancelCase(
  caseId: string,
  reason: string,
): Promise<CaseActionState> {
  await requireSession();
  const supabase = await createClient();
  const { error } = await supabase.rpc("edospmis_cancel_case", {
    p_case_id: caseId,
    p_reason: reason || null,
  });
  if (error) return { error: error.message, ok: null };
  revalidatePath(`/app/cases/${caseId}`);
  return { error: null, ok: "Case cancelled." };
}

export async function setCaseHold(
  caseId: string,
  onHold: boolean,
  reason: string,
): Promise<CaseActionState> {
  await requireSession();
  const supabase = await createClient();
  const { error } = await supabase.rpc("edospmis_set_case_hold", {
    p_case_id: caseId,
    p_on_hold: onHold,
    p_reason: reason || null,
  });
  if (error) return { error: error.message, ok: null };

  const holdCtx = await caseContext(caseId);
  if (holdCtx) {
    await notifyUser({
      tenantId: holdCtx.tenantId,
      userId: holdCtx.requesterId,
      caseId,
      kind: "case.on_hold",
      title: onHold
        ? `${holdCtx.caseNumber}: put on hold`
        : `${holdCtx.caseNumber}: the hold has been lifted`,
      body: reason || holdCtx.title || undefined,
      href: `/app/cases/${caseId}`,
    });
    if (!onHold) await resolveNotifications(caseId, "case.on_hold");
  }

  revalidatePath(`/app/cases/${caseId}`);
  return { error: null, ok: onHold ? "Case put on hold." : "Hold released." };
}

export async function setCaseBlocked(
  caseId: string,
  blocked: boolean,
  reason: string,
): Promise<CaseActionState> {
  await requireSession();
  const supabase = await createClient();
  const { error } = await supabase.rpc("edospmis_set_case_blocked", {
    p_case_id: caseId,
    p_blocked: blocked,
    p_reason: reason || null,
  });
  if (error) return { error: error.message, ok: null };

  const blockedCtx = await caseContext(caseId);
  if (blockedCtx) {
    // Blocked is louder than a hold: a hold is a decision somebody made here,
    // a block is waiting on something outside the case that nobody is
    // watching for.
    await notifyUser({
      tenantId: blockedCtx.tenantId,
      userId: blockedCtx.requesterId,
      caseId,
      kind: "case.blocked",
      title: blocked
        ? `${blockedCtx.caseNumber}: blocked — it needs something from outside`
        : `${blockedCtx.caseNumber}: unblocked and moving again`,
      body: reason || blockedCtx.title || undefined,
      href: `/app/cases/${caseId}`,
    });
    if (!blocked) await resolveNotifications(caseId, "case.blocked");
  }

  revalidatePath(`/app/cases/${caseId}`);
  return {
    error: null,
    ok: blocked ? "Case marked blocked." : "Block cleared.",
  };
}
