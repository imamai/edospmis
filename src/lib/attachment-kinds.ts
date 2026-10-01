/**
 * What an attachment is, in the requester's words.
 *
 * Deliberately not in lib/data/attachments.ts: that module is `server-only`,
 * and the upload panel is a client component that needs these labels. A
 * vocabulary shared by both sides of the boundary has to live on neither.
 */

export type AttachmentKind =
  | "price_list"
  | "quotation_received"
  | "flyer"
  | "specification"
  | "photo"
  | "other";

export const ATTACHMENT_KIND_LABEL: Record<AttachmentKind, string> = {
  price_list: "Price list",
  quotation_received: "Quote I was given",
  flyer: "Flyer or brochure",
  specification: "Specification",
  photo: "Photograph",
  other: "Other",
};

/** The bucket name, needed by the browser upload as well as the server. */
export const ATTACHMENT_BUCKET = "edospmis-attachments";

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
