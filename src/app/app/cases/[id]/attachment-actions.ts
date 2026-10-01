"use server";

import { revalidatePath } from "next/cache";
import { requireSession, can } from "@/lib/data/session";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { signedAttachmentUrl } from "@/lib/data/attachments";
import { ATTACHMENT_BUCKET, type AttachmentKind } from "@/lib/attachment-kinds";

export interface AttachmentState {
  error: string | null;
  ok: string | null;
}

/**
 * Attaching evidence to a request.
 *
 * The file itself goes from the browser straight to Storage — a server action
 * is not a sensible pipe for binary, and the bucket's own policy already
 * checks the uploader belongs to the tenant whose folder they are writing to.
 * This records what was uploaded, which is the part the app reads.
 *
 * The path is trusted only as far as it can be checked: it must sit under
 * this tenant's folder and this case's folder, so a crafted path cannot file
 * an object against somebody else's request.
 */
export async function recordAttachment(input: {
  caseId: string;
  storagePath: string;
  filename: string;
  contentType: string | null;
  byteSize: number;
  kind: AttachmentKind;
  note: string | null;
}): Promise<AttachmentState> {
  const session = await requireSession();
  if (!can(session, "procurement.pr.create")) {
    return {
      error: "You don't have permission to attach files to a request.",
      ok: null,
    };
  }

  const expectedPrefix = `${session.tenant.id}/${input.caseId}/`;
  if (!input.storagePath.startsWith(expectedPrefix)) {
    return {
      error: "That file was not stored where it should be. Try again.",
      ok: null,
    };
  }

  const supabase = await createClient();

  // Attach while it is still yours to change. Once a request is with an
  // approver, what they are deciding on has to stop moving — an attachment
  // that appears after a decision makes the decision unreadable.
  const { data: pr } = await supabase
    .from("edospmis_prs")
    .select("id, status, requester_id")
    .eq("case_id", input.caseId)
    .eq("tenant_id", session.tenant.id)
    .maybeSingle<{ id: string; status: string; requester_id: string }>();

  if (!pr) return { error: "That request could not be found.", ok: null };
  if (pr.status !== "draft") {
    return {
      error:
        "This request has already been submitted, so its attachments are fixed.",
      ok: null,
    };
  }
  if (
    pr.requester_id !== session.user.id &&
    !can(session, "procurement.pr.edit")
  ) {
    return {
      error: "Only the requester can attach files to this request.",
      ok: null,
    };
  }

  const { error } = await supabase.from("edospmis_case_attachments").insert({
    tenant_id: session.tenant.id,
    case_id: input.caseId,
    storage_path: input.storagePath,
    filename: input.filename,
    content_type: input.contentType,
    byte_size: input.byteSize,
    kind: input.kind,
    note: input.note,
    uploaded_by: session.user.id,
  });
  if (error) return { error: "Couldn't record that attachment.", ok: null };

  await logAudit({
    tenantId: session.tenant.id,
    actorId: session.user.id,
    action: "case.attachment.added",
    entityType: "case",
    entityId: input.caseId,
    after: { filename: input.filename, kind: input.kind },
  });

  revalidatePath(`/app/cases/${input.caseId}`);
  return { error: null, ok: `Attached ${input.filename}.` };
}

/**
 * Removing an attachment, object and row together.
 *
 * The object goes first. A row left pointing at a deleted object shows as a
 * broken link, which somebody will report; an object left with no row is
 * invisible and simply accumulates, paid for and unreachable.
 */
export async function removeAttachment(
  caseId: string,
  attachmentId: string,
): Promise<AttachmentState> {
  const session = await requireSession();
  if (!can(session, "procurement.pr.create")) {
    return {
      error: "You don't have permission to change this request.",
      ok: null,
    };
  }

  const supabase = await createClient();
  const { data: row } = await supabase
    .from("edospmis_case_attachments")
    .select("id, storage_path, filename")
    .eq("id", attachmentId)
    .eq("tenant_id", session.tenant.id)
    .eq("case_id", caseId)
    .maybeSingle<{ id: string; storage_path: string; filename: string }>();
  if (!row) return { error: "That attachment could not be found.", ok: null };

  const { data: pr } = await supabase
    .from("edospmis_prs")
    .select("status, requester_id")
    .eq("case_id", caseId)
    .eq("tenant_id", session.tenant.id)
    .maybeSingle<{ status: string; requester_id: string }>();
  if (pr && pr.status !== "draft") {
    return {
      error:
        "This request has already been submitted, so its attachments are fixed.",
      ok: null,
    };
  }
  if (
    pr &&
    pr.requester_id !== session.user.id &&
    !can(session, "procurement.pr.edit")
  ) {
    return {
      error: "Only the requester can change this request's attachments.",
      ok: null,
    };
  }

  await supabase.storage.from(ATTACHMENT_BUCKET).remove([row.storage_path]);

  const { error } = await supabase
    .from("edospmis_case_attachments")
    .delete()
    .eq("id", attachmentId)
    .eq("tenant_id", session.tenant.id);
  if (error) return { error: "Couldn't remove that attachment.", ok: null };

  await logAudit({
    tenantId: session.tenant.id,
    actorId: session.user.id,
    action: "case.attachment.removed",
    entityType: "case",
    entityId: caseId,
    before: { filename: row.filename },
  });

  revalidatePath(`/app/cases/${caseId}`);
  return { error: null, ok: `Removed ${row.filename}.` };
}

/** A short-lived link, minted for whoever is asking. */
export async function getAttachmentUrl(
  attachmentId: string,
): Promise<string | null> {
  const session = await requireSession();
  return signedAttachmentUrl(session.tenant.id, attachmentId);
}
