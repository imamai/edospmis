"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { BID_BUCKET } from "@/lib/tender-types";
import { notifyBySupplierToken } from "@/lib/notify/supplier-events";

/**
 * The bidder's side of the tender pack.
 *
 * A bidder has no account, so these run with the admin client — and every one
 * of them immediately hands the token to a database function that
 * re-establishes who they are and re-checks the five conditions (token
 * resolves, not expired, RFQ open, closing date not passed, not already
 * answered). Nothing here decides on its own that a request is allowed; the
 * service role is used only because there is no session for a policy to read,
 * never to skip a check.
 */

export interface BidActionState {
  error: string | null;
  ok: string | null;
}

const MAX_BYTES = 15 * 1024 * 1024;

const ACCEPTED = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

/** The buying tenant behind this invitation, needed to build the storage path. */
async function tenantForToken(token: string): Promise<string | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("edospmis_rfq_suppliers")
    .select("edospmis_rfqs(tenant_id)")
    .eq("access_token", token)
    .maybeSingle();
  if (!data) return null;
  const joined = (
    data as unknown as {
      edospmis_rfqs: { tenant_id: string } | { tenant_id: string }[] | null;
    }
  ).edospmis_rfqs;
  const one = Array.isArray(joined) ? (joined[0] ?? null) : joined;
  return one?.tenant_id ?? null;
}

/**
 * Uploading one of the documents this tender asked for.
 *
 * The file arrives through the action rather than going straight to Storage,
 * which is the opposite of how every signed-in upload in this app works — and
 * it has to be, because a storage policy has no identity to check for a
 * bidder. The token is checked first, and the object is written under a path
 * the database then independently refuses if it is not this submission's own.
 */
export async function uploadBidDocument(
  token: string,
  form: FormData,
): Promise<BidActionState> {
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a file to upload.", ok: null };
  }
  if (file.size > MAX_BYTES) {
    return {
      error: `Keep each file under ${MAX_BYTES / (1024 * 1024)}MB.`,
      ok: null,
    };
  }
  if (file.type && !ACCEPTED.includes(file.type)) {
    return {
      error: "Upload a PDF, an image, a Word document or a spreadsheet.",
      ok: null,
    };
  }

  const docTypeId = String(form.get("doc_type_id") ?? "").trim() || null;
  const note = String(form.get("note") ?? "").trim() || null;

  const supabase = createAdminClient();

  // This both creates the draft and performs every check. If the bidder is not
  // entitled to be doing this, it raises here, before anything is written.
  const { data: submissionId, error: draftError } = await supabase.rpc(
    "edospmis_bid_draft_by_token",
    { p_token: token },
  );
  if (draftError || !submissionId) {
    return {
      error: draftError?.message ?? "This link is no longer open.",
      ok: null,
    };
  }

  const tenantId = await tenantForToken(token);
  if (!tenantId)
    return { error: "This link is invalid or has expired.", ok: null };

  const ext = file.name.includes(".")
    ? file.name.split(".").pop()!.slice(0, 8)
    : "bin";
  const path = `${tenantId}/bids/${submissionId}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(BID_BUCKET)
    .upload(path, file, {
      contentType: file.type || "application/octet-stream",
    });
  if (uploadError)
    return {
      error: `That file could not be uploaded (${uploadError.message}).`,
      ok: null,
    };

  const { error } = await supabase.rpc("edospmis_bid_add_document_by_token", {
    p_token: token,
    p_doc_type_id: docTypeId,
    p_storage_path: path,
    p_filename: file.name,
    p_content_type: file.type || null,
    p_byte_size: file.size,
    p_note: note,
  });

  if (error) {
    // Uploaded but unreferenced — removed rather than left behind.
    await supabase.storage.from(BID_BUCKET).remove([path]);
    return { error: error.message, ok: null };
  }

  revalidatePath(`/quote/${token}`);
  return { error: null, ok: `${file.name} uploaded.` };
}

/** Saving the answers to a template rendered as questions. */
export async function saveBidTemplate(
  token: string,
  templateId: string,
  answers: Record<string, string>,
): Promise<BidActionState> {
  const supabase = createAdminClient();
  const { error } = await supabase.rpc("edospmis_bid_save_template_by_token", {
    p_token: token,
    p_template_id: templateId,
    p_answers: answers,
    p_storage_path: null,
    p_filename: null,
    p_content_type: null,
    p_byte_size: null,
  });
  if (error) return { error: error.message, ok: null };

  revalidatePath(`/quote/${token}`);
  return { error: null, ok: "Saved." };
}

/** Returning a completed copy of a template that was issued as a file. */
export async function uploadBidTemplateFile(
  token: string,
  form: FormData,
): Promise<BidActionState> {
  const templateId = String(form.get("template_id") ?? "").trim();
  const file = form.get("file");
  if (!templateId) return { error: "Which form is this?", ok: null };
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose the completed file.", ok: null };
  }
  if (file.size > MAX_BYTES) {
    return {
      error: `Keep the file under ${MAX_BYTES / (1024 * 1024)}MB.`,
      ok: null,
    };
  }

  const supabase = createAdminClient();
  const { data: submissionId, error: draftError } = await supabase.rpc(
    "edospmis_bid_draft_by_token",
    { p_token: token },
  );
  if (draftError || !submissionId) {
    return {
      error: draftError?.message ?? "This link is no longer open.",
      ok: null,
    };
  }

  const tenantId = await tenantForToken(token);
  if (!tenantId)
    return { error: "This link is invalid or has expired.", ok: null };

  const ext = file.name.includes(".")
    ? file.name.split(".").pop()!.slice(0, 8)
    : "bin";
  const path = `${tenantId}/bids/${submissionId}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(BID_BUCKET)
    .upload(path, file, {
      contentType: file.type || "application/octet-stream",
    });
  if (uploadError)
    return {
      error: `That file could not be uploaded (${uploadError.message}).`,
      ok: null,
    };

  const { error } = await supabase.rpc("edospmis_bid_save_template_by_token", {
    p_token: token,
    p_template_id: templateId,
    p_answers: {},
    p_storage_path: path,
    p_filename: file.name,
    p_content_type: file.type || null,
    p_byte_size: file.size,
  });
  if (error) {
    await supabase.storage.from(BID_BUCKET).remove([path]);
    return { error: error.message, ok: null };
  }

  revalidatePath(`/quote/${token}`);
  return { error: null, ok: `${file.name} uploaded.` };
}

/**
 * Signing, which is what turns a draft into a bid.
 *
 * The address is recorded alongside the name and the moment. The hash that
 * makes the signature mean anything is computed in the database from what is
 * actually stored — never passed from here, because a hash supplied by the
 * caller would prove only that the caller said so.
 */
export async function signBid(
  token: string,
  signedName: string,
  signedPosition: string,
): Promise<BidActionState> {
  const h = await headers();
  // The first entry is the client; the rest are proxies that added themselves.
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip")?.trim() ||
    null;

  const supabase = createAdminClient();
  const { error } = await supabase.rpc("edospmis_bid_sign_by_token", {
    p_token: token,
    p_signed_name: signedName,
    p_signed_position: signedPosition,
    p_signed_ip: ip,
  });
  if (error) return { error: error.message, ok: null };

  await notifyBySupplierToken(token, {
    kind: "bid.submitted",
    title: "a bidder has returned their documents — check them before awarding",
    permission: "procurement.rfq.evaluate",
  });

  revalidatePath(`/quote/${token}`);
  return { error: null, ok: "Submitted. Thank you." };
}
