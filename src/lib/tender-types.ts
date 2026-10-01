/**
 * The tender pack's vocabulary, shared by both sides of the client boundary.
 *
 * Not in lib/data/tender.ts: that module is `server-only`, and the bidder's
 * page and the requirement pickers are client components. A shape used by
 * both has to live where neither owns it.
 */

export interface SupplierDocType {
  id: string;
  /** Null for the shared library every workspace sees. */
  tenant_id: string | null;
  name: string;
  description: string | null;
  default_required: boolean;
  sort_order: number;
  is_active: boolean;
}

export type TemplateKind = "document" | "form";

/** One question on a 'form' template. */
export interface TemplateField {
  key: string;
  label: string;
  type: "text" | "textarea" | "number" | "date";
  required?: boolean;
  help?: string;
}

export interface ProcurementTemplate {
  id: string;
  tenant_id: string | null;
  name: string;
  description: string | null;
  kind: TemplateKind;
  filename: string | null;
  fields: TemplateField[];
  instructions: string | null;
  is_active: boolean;
}

/** A requirement as the buyer set it on one RFQ. */
export interface RfqRequirement {
  requirement_id: string;
  kind: "document" | "template";
  doc_type_id: string | null;
  template_id: string | null;
  name: string;
  description: string | null;
  is_mandatory: boolean;
  /** Only for a template requirement. */
  template_kind: TemplateKind | null;
  template_fields: TemplateField[] | null;
  template_instructions: string | null;
  template_filename: string | null;
}

/** What the bidder has returned so far, as their own page sees it. */
export interface BidPack {
  rfq_id: string;
  closing_date: string | null;
  closed: boolean;
  expired: boolean;
  invite_status: "invited" | "viewed" | "submitted" | "declined";
  submission_id: string | null;
  requirements: RfqRequirement[];
  documents: {
    id: string;
    doc_type_id: string | null;
    filename: string;
    byte_size: number | null;
    note: string | null;
  }[];
  template_responses: {
    template_id: string;
    answers: Record<string, string>;
    filename: string | null;
  }[];
}

/** One line of "what this bidder still owes", as the buyer sees it. */
export interface OutstandingRequirement {
  requirement_id: string;
  kind: "document" | "template";
  label: string;
  is_mandatory: boolean;
}

export const BID_BUCKET = "edospmis-attachments";

/** Where a bidder's files sit, and the only prefix the database will accept. */
export function bidFolder(tenantId: string, submissionId: string): string {
  return `${tenantId}/bids/${submissionId}`;
}

/** Where a tenant's own issued template files sit. */
export function templateFolder(tenantId: string): string {
  return `${tenantId}/templates`;
}
