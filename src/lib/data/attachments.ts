import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * Files a requester attached to their own request.
 *
 * The bucket is private, so there is no durable URL to store or render. A
 * signed one is minted per view, for the person asking, and expires — which
 * is the point: a supplier's price list should not be readable by anybody who
 * once saw the link.
 */

export const ATTACHMENT_BUCKET = "edospmis-attachments";

export type AttachmentKind =
  | "price_list"
  | "quotation_received"
  | "flyer"
  | "specification"
  | "photo"
  | "other";

/** Said in the requester's words, not the schema's. */
export const ATTACHMENT_KIND_LABEL: Record<AttachmentKind, string> = {
  price_list: "Price list",
  quotation_received: "Quote I was given",
  flyer: "Flyer or brochure",
  specification: "Specification",
  photo: "Photograph",
  other: "Other",
};

interface Person {
  full_name: string | null;
  email: string;
}

export interface CaseAttachment {
  id: string;
  filename: string;
  content_type: string | null;
  byte_size: number | null;
  kind: AttachmentKind;
  note: string | null;
  created_at: string;
  uploaded_by_name: string | null;
}

export async function listCaseAttachments(
  tenantId: string,
  caseId: string,
): Promise<CaseAttachment[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("edospmis_case_attachments")
    .select(
      "id, filename, content_type, byte_size, kind, note, created_at, edospmis_users(full_name, email)",
    )
    .eq("tenant_id", tenantId)
    .eq("case_id", caseId)
    .order("created_at");

  return (data ?? []).map((row) => {
    // The embedded row comes back as an object for a to-one relation and as a
    // single-element array when the generated types cannot tell that it is
    // one. Normalised here rather than asserted, so neither shape throws.
    const joined = (
      row as unknown as {
        edospmis_users: Person | Person[] | null;
      }
    ).edospmis_users;
    const who = Array.isArray(joined) ? (joined[0] ?? null) : joined;
    return {
      id: row.id as string,
      filename: row.filename as string,
      content_type: (row.content_type as string | null) ?? null,
      byte_size: (row.byte_size as number | null) ?? null,
      kind: row.kind as AttachmentKind,
      note: (row.note as string | null) ?? null,
      created_at: row.created_at as string,
      uploaded_by_name: who?.full_name ?? who?.email ?? null,
    };
  });
}

/**
 * A short-lived link to one attachment.
 *
 * Scoped by tenant on the way in, so an id guessed from another workspace
 * returns nothing rather than a working link. Ten minutes is long enough to
 * open a PDF and short enough that a link pasted into a chat stops working.
 */
export async function signedAttachmentUrl(
  tenantId: string,
  attachmentId: string,
): Promise<string | null> {
  const supabase = await createClient();
  const { data: row } = await supabase
    .from("edospmis_case_attachments")
    .select("storage_path")
    .eq("id", attachmentId)
    .eq("tenant_id", tenantId)
    .maybeSingle<{ storage_path: string }>();
  if (!row) return null;

  const { data } = await supabase.storage
    .from(ATTACHMENT_BUCKET)
    .createSignedUrl(row.storage_path, 600);
  return data?.signedUrl ?? null;
}
