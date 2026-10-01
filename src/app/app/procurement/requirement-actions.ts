"use server";

import { revalidatePath } from "next/cache";
import { requireSession, can } from "@/lib/data/session";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { signedBidDocumentUrl } from "@/lib/data/tender";

export interface RequirementState {
  error: string | null;
  ok: string | null;
}

export interface RequirementChoice {
  /** Exactly one of these two, matching the table's own constraint. */
  docTypeId?: string;
  templateId?: string;
  isMandatory: boolean;
}

/**
 * What this tender requires of a bidder.
 *
 * Replaces the whole set rather than diffing it: the screen is a tick list,
 * and a tick list means "this is now the list". Diffing would also have to
 * decide what an untick means for a bidder who has already uploaded against
 * it, and the answer — leave their document, stop requiring it — falls out of
 * replace-and-keep for free, because the documents hang off the submission
 * rather than off the requirement.
 *
 * Deliberately refused once anyone has submitted. Changing what a tender asks
 * for after a bid is in is how a tender gets challenged: the bidders were not
 * answering the same question. Whoever needs to change it cancels and
 * re-issues, which leaves a record that it happened.
 */
export async function setRfqRequirements(
  rfqId: string,
  caseId: string,
  choices: RequirementChoice[],
): Promise<RequirementState> {
  const session = await requireSession();
  if (!can(session, "procurement.rfq.send")) {
    return {
      error: "You don't have permission to set tender requirements.",
      ok: null,
    };
  }

  const supabase = await createClient();

  const { data: rfq } = await supabase
    .from("edospmis_rfqs")
    .select("id, status")
    .eq("id", rfqId)
    .eq("tenant_id", session.tenant.id)
    .maybeSingle<{ id: string; status: string }>();
  if (!rfq) return { error: "That tender could not be found.", ok: null };
  if (rfq.status !== "open") {
    return {
      error: "This tender is closed, so its requirements are fixed.",
      ok: null,
    };
  }

  const { count: submitted } = await supabase
    .from("edospmis_bid_submissions")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", session.tenant.id)
    .eq("rfq_id", rfqId)
    .eq("status", "submitted");

  if (submitted && submitted > 0) {
    return {
      error:
        "A bidder has already submitted against this tender, so what it asks for can no longer change. Cancel and re-issue if it must.",
      ok: null,
    };
  }

  const rows = choices
    .filter((c) => (c.docTypeId ? !c.templateId : !!c.templateId))
    .map((c) => ({
      tenant_id: session.tenant.id,
      rfq_id: rfqId,
      doc_type_id: c.docTypeId ?? null,
      template_id: c.templateId ?? null,
      is_mandatory: c.isMandatory,
    }));

  const { error: clearError } = await supabase
    .from("edospmis_rfq_requirements")
    .delete()
    .eq("tenant_id", session.tenant.id)
    .eq("rfq_id", rfqId);
  if (clearError)
    return { error: "Couldn't update the requirements.", ok: null };

  if (rows.length > 0) {
    const { error } = await supabase
      .from("edospmis_rfq_requirements")
      .insert(rows);
    if (error) return { error: "Couldn't save those requirements.", ok: null };
  }

  await logAudit({
    tenantId: session.tenant.id,
    actorId: session.user.id,
    action: "rfq.requirements.set",
    entityType: "rfq",
    entityId: rfqId,
    after: {
      documents: rows.filter((r) => r.doc_type_id).length,
      templates: rows.filter((r) => r.template_id).length,
      mandatory: rows.filter((r) => r.is_mandatory).length,
    },
  });

  revalidatePath(`/app/cases/${caseId}`);
  return {
    error: null,
    ok:
      rows.length === 0
        ? "This tender now asks for nothing beyond a price."
        : `Bidders must return ${rows.length} item${rows.length === 1 ? "" : "s"}.`,
  };
}

/**
 * A short-lived link to one bid document, for an evaluator.
 *
 * Scoped by tenant on the way in, so an id guessed from another workspace
 * returns nothing rather than a working link to somebody else's CR12.
 */
export async function openBidDocument(
  documentId: string,
): Promise<string | null> {
  const session = await requireSession();
  if (
    !can(session, "procurement.rfq.evaluate") &&
    !can(session, "procurement.rfq.view")
  )
    return null;
  return signedBidDocumentUrl(session.tenant.id, documentId);
}
