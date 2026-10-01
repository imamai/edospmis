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

export interface FulfilmentState {
  error: string | null;
  ok: string | null;
}

function parseGrnItems(form: FormData) {
  const descriptions = form.getAll("item_description") as string[];
  const units = form.getAll("item_unit") as string[];
  const ordered = form.getAll("item_ordered_qty") as string[];
  const received = form.getAll("item_received_qty") as string[];
  const conditions = form.getAll("item_condition") as string[];
  const items = [];
  for (let i = 0; i < descriptions.length; i++) {
    const description = (descriptions[i] ?? "").trim();
    if (!description) continue;
    items.push({
      description,
      unit: (units[i] ?? "").trim() || null,
      ordered_qty: Math.max(0, Number(ordered[i] ?? 0) || 0),
      received_qty: Math.max(0, Number(received[i] ?? 0) || 0),
      condition: conditions[i] || "accepted",
    });
  }
  return items;
}

export async function recordGrn(
  _prev: FulfilmentState,
  form: FormData,
): Promise<FulfilmentState> {
  await requireSession();
  const caseId = String(form.get("case_id") ?? "");
  const notes = String(form.get("notes") ?? "").trim() || null;
  const items = parseGrnItems(form);
  if (items.length === 0) return { error: "Add at least one item.", ok: null };

  const supabase = await createClient();
  const { error } = await supabase.rpc("edospmis_record_grn", {
    p_case_id: caseId,
    p_items: items,
    p_notes: notes,
  });
  if (error) return { error: error.message, ok: null };

  const ctx = await caseContext(caseId);
  if (ctx) {
    await resolveNotifications(caseId, "po.issued");
    await notifyRole({
      tenantId: ctx.tenantId,
      caseId,
      kind: "grn.recorded",
      title: `${ctx.caseNumber}: goods received — enter the supplier invoice`,
      body: ctx.title ?? undefined,
      href: `/app/cases/${caseId}`,
      permission: "finance.invoice.create",
    });
    await notifyUser({
      tenantId: ctx.tenantId,
      userId: ctx.requesterId,
      caseId,
      kind: "grn.recorded.requester",
      title: `${ctx.caseNumber}: your goods have been received`,
      body: ctx.title ?? undefined,
      href: `/app/cases/${caseId}`,
    });
  }

  revalidatePath(`/app/cases/${caseId}`);
  return { error: null, ok: "Goods receipt recorded." };
}

export async function recordInspection(
  _prev: FulfilmentState,
  form: FormData,
): Promise<FulfilmentState> {
  await requireSession();
  const grnId = String(form.get("grn_id") ?? "");
  const caseId = String(form.get("case_id") ?? "");
  const result = String(form.get("result") ?? "");
  const comments = String(form.get("comments") ?? "").trim() || null;
  const evidenceRef = String(form.get("evidence_ref") ?? "").trim() || null;
  if (!result) return { error: "Choose an inspection result.", ok: null };

  const supabase = await createClient();
  const { error } = await supabase.rpc("edospmis_record_inspection", {
    p_grn_id: grnId,
    p_result: result,
    p_comments: comments,
    p_evidence_ref: evidenceRef,
  });
  if (error) return { error: error.message, ok: null };

  if (result === "fail") {
    const ctx = await caseContext(caseId);
    if (ctx) {
      await notifyRole({
        tenantId: ctx.tenantId,
        caseId,
        kind: "grn.inspection_failed",
        title: `${ctx.caseNumber}: inspection failed — take it up with the supplier`,
        body: comments ?? ctx.title ?? undefined,
        href: `/app/cases/${caseId}`,
        permission: "procurement.po.view",
        blocks: true,
      });
    }
  }

  revalidatePath(`/app/cases/${caseId}`);
  return { error: null, ok: "Inspection recorded." };
}

export async function scheduleDelivery(
  _prev: FulfilmentState,
  form: FormData,
): Promise<FulfilmentState> {
  await requireSession();
  const caseId = String(form.get("case_id") ?? "");
  const scheduledAt = String(form.get("scheduled_at") ?? "");
  const notes = String(form.get("notes") ?? "").trim() || null;
  if (!scheduledAt) return { error: "Pick a date and time.", ok: null };

  const supabase = await createClient();
  const { error } = await supabase.rpc("edospmis_schedule_delivery", {
    p_case_id: caseId,
    p_scheduled_at: new Date(scheduledAt).toISOString(),
    p_notes: notes,
  });
  if (error) return { error: error.message, ok: null };

  const ctx = await caseContext(caseId);
  if (ctx) {
    await notifyUser({
      tenantId: ctx.tenantId,
      userId: ctx.requesterId,
      caseId,
      kind: "delivery.scheduled",
      title: `${ctx.caseNumber}: your delivery has been scheduled`,
      body: ctx.title ?? undefined,
      href: `/app/cases/${caseId}`,
    });
  }

  revalidatePath(`/app/cases/${caseId}`);
  return { error: null, ok: "Delivery scheduled." };
}

export async function dispatchDelivery(
  deliveryId: string,
  caseId: string,
): Promise<FulfilmentState> {
  await requireSession();
  const supabase = await createClient();
  const { error } = await supabase.rpc("edospmis_dispatch_delivery", {
    p_delivery_id: deliveryId,
  });
  if (error) return { error: error.message, ok: null };

  const ctx = await caseContext(caseId);
  if (ctx) {
    await notifyUser({
      tenantId: ctx.tenantId,
      userId: ctx.requesterId,
      caseId,
      kind: "delivery.dispatched",
      title: `${ctx.caseNumber}: your delivery is on its way`,
      body: ctx.title ?? undefined,
      href: `/app/cases/${caseId}`,
    });
  }

  revalidatePath(`/app/cases/${caseId}`);
  return { error: null, ok: "Delivery dispatched." };
}

export async function confirmDelivery(
  _prev: FulfilmentState,
  form: FormData,
): Promise<FulfilmentState> {
  await requireSession();
  const deliveryId = String(form.get("delivery_id") ?? "");
  const caseId = String(form.get("case_id") ?? "");
  const proofType = String(form.get("proof_type") ?? "none");
  const proofRef = String(form.get("proof_ref") ?? "").trim() || null;
  const notes = String(form.get("notes") ?? "").trim() || null;

  const supabase = await createClient();
  const { error } = await supabase.rpc("edospmis_confirm_delivery", {
    p_delivery_id: deliveryId,
    p_proof_type: proofType,
    p_proof_ref: proofRef,
    p_notes: notes,
  });
  if (error) return { error: error.message, ok: null };

  // Confirming the delivery closes the case (migration 0053), so this is the
  // end of the line: the requester is told, and every outstanding ask on this
  // case is cleared. Anything still unresolved here is work nobody needs to
  // do any more.
  const ctx = await caseContext(caseId);
  if (ctx) {
    await notifyUser({
      tenantId: ctx.tenantId,
      userId: ctx.requesterId,
      caseId,
      kind: "case.closed",
      title: `${ctx.caseNumber}: delivered and closed`,
      body: ctx.title ?? undefined,
      href: `/app/cases/${caseId}`,
    });
    for (const kind of [
      "pr.submitted",
      "pr.approved",
      "po.pending_approval",
      "po.issued",
      "grn.recorded",
      "grn.inspection_failed",
      "invoice.submitted",
      "invoice.exception",
      "invoice.approved",
      "quotation.received",
      "bid.submitted",
    ]) {
      await resolveNotifications(caseId, kind);
    }
  }

  revalidatePath(`/app/cases/${caseId}`);
  return { error: null, ok: "Delivery confirmed." };
}

export async function closeCase(
  caseId: string,
  reason: string,
): Promise<FulfilmentState> {
  await requireSession();
  const supabase = await createClient();
  const { error } = await supabase.rpc("edospmis_close_case", {
    p_case_id: caseId,
    p_reason: reason || null,
  });
  if (error) return { error: error.message, ok: null };
  revalidatePath(`/app/cases/${caseId}`);
  return { error: null, ok: "Case closed." };
}
