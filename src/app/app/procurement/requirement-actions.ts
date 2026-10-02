"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireSession, can } from "@/lib/data/session";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { signedBidDocumentUrl } from "@/lib/data/tender";
import { sendEmail } from "@/lib/notify/email";
import { bidReturnedEmail } from "@/lib/notify/auth-email";

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

/**
 * Sending a bid back to its supplier for correction.
 *
 * WHAT THIS IS FOR. An expired CR12, a certificate that did not upload, a form
 * of tender with a blank where a date should be. Documents are proof of facts
 * that already existed when the bid was made, so supplying them again changes
 * nothing about the offer.
 *
 * WHAT IT IS NOT FOR. The price. The database carries the original quotation
 * forward untouched and will not take a second one, because a buyer who can
 * return a bid and receive a different number is choosing the winner after
 * seeing the field. If a price is genuinely wrong, that is a rejection or —
 * before the closing date — the bidder's own withdrawal, not a correction.
 *
 * The supplier is emailed. Everything else about this is pointless if the only
 * notice they get is a page they have no reason to revisit.
 */
export async function returnBidForCorrection(
  caseId: string,
  submissionId: string,
  reason: string,
  docTypeIds: string[],
  templateIds: string[],
): Promise<RequirementState> {
  const session = await requireSession();
  if (!can(session, "procurement.rfq.evaluate")) {
    return { error: "You don't have permission to return a bid.", ok: null };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("edospmis_return_bid_for_correction", {
    p_submission_id: submissionId,
    p_reason: reason,
    p_doc_type_ids: docTypeIds,
    p_template_ids: templateIds,
  });
  // The function's own messages are written for this screen — "choose at
  // least one document", "this tender has been awarded" — so they are shown
  // rather than replaced with something vaguer.
  if (error) return { error: error.message, ok: null };

  const mailed = await emailBidReturn(
    submissionId,
    reason,
    session.tenant.name,
  );

  revalidatePath(`/app/cases/${caseId}`);
  return {
    error: null,
    ok: mailed
      ? "Sent back to the supplier, and they have been emailed."
      : "Sent back to the supplier. They have no email address on file — send them their link.",
  };
}

/**
 * Telling the supplier their bid is back with them.
 *
 * Best-effort, like every other notification in this app: the return has
 * already happened and committed, and failing to send an email must not
 * unwind it or show the buyer an error for something that did work.
 */
async function emailBidReturn(
  submissionId: string,
  reason: string,
  tenantName: string,
): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data: sub } = await supabase
      .from("edospmis_bid_submissions")
      .select("rfq_id, supplier_id")
      .eq("id", submissionId)
      .maybeSingle();
    if (!sub) return false;

    const { data: invite } = await supabase
      .from("edospmis_rfq_suppliers")
      .select(
        "access_token, invite_email, edospmis_rfqs(title), edospmis_suppliers(email)",
      )
      .eq("rfq_id", sub.rfq_id)
      .eq("supplier_id", sub.supplier_id)
      .maybeSingle();
    if (!invite) return false;

    const one = <T>(v: T | T[] | null | undefined): T | null =>
      Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
    const supplier = one(
      invite.edospmis_suppliers as
        { email: string | null } | { email: string | null }[] | null,
    );
    const rfq = one(
      invite.edospmis_rfqs as { title: string } | { title: string }[] | null,
    );

    const to = invite.invite_email || supplier?.email;
    if (!to) return false;

    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    const base = host
      ? `${h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")}://${host}`
      : (process.env.NEXT_PUBLIC_SITE_URL ?? "");

    const result = await sendEmail({
      to,
      ...bidReturnedEmail({
        link: `${base}/quote/${invite.access_token}`,
        tenantName,
        rfqTitle: rfq?.title ?? "a request",
        reason,
      }),
    });
    return result.ok;
  } catch (cause) {
    console.error("EDOSPMIS bid-return email failed:", cause);
    return false;
  }
}
