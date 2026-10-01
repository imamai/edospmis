import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  BID_BUCKET,
  type BidPack,
  type OutstandingRequirement,
  type ProcurementTemplate,
  type RfqRequirement,
  type SupplierDocType,
} from "@/lib/tender-types";

/**
 * The tender pack, from the buyer's side.
 *
 * Buyer-side reads use the caller's own client, so row-level security decides
 * what they see. The bidder-side calls use the admin client, because a bidder
 * has no session for a policy to check — the token functions re-establish who
 * they are and refuse anything they cannot justify (migration 0051).
 */

// ── What a tenant can ask for ─────────────────────────────────────────

export async function listDocTypes(
  tenantId: string,
): Promise<SupplierDocType[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("edospmis_supplier_doc_types")
    .select(
      "id, tenant_id, name, description, default_required, sort_order, is_active",
    )
    .or(`tenant_id.is.null,tenant_id.eq.${tenantId}`)
    .order("sort_order")
    .order("name");
  return (data ?? []) as SupplierDocType[];
}

export async function listTemplates(
  tenantId: string,
): Promise<ProcurementTemplate[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("edospmis_procurement_templates")
    .select(
      "id, tenant_id, name, description, kind, filename, fields, instructions, is_active",
    )
    .or(`tenant_id.is.null,tenant_id.eq.${tenantId}`)
    .order("name");
  return (data ?? []) as ProcurementTemplate[];
}

// ── What one tender requires ──────────────────────────────────────────

export async function listRfqRequirements(
  tenantId: string,
  rfqId: string,
): Promise<RfqRequirement[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("edospmis_rfq_requirements")
    .select(
      "id, doc_type_id, template_id, is_mandatory, edospmis_supplier_doc_types(name, description, sort_order), edospmis_procurement_templates(name, description, kind, fields, instructions, filename)",
    )
    .eq("tenant_id", tenantId)
    .eq("rfq_id", rfqId);

  type DocJoin = {
    name: string;
    description: string | null;
    sort_order: number;
  };
  type TplJoin = {
    name: string;
    description: string | null;
    kind: "document" | "form";
    fields: RfqRequirement["template_fields"];
    instructions: string | null;
    filename: string | null;
  };
  const one = <T>(v: T | T[] | null): T | null =>
    Array.isArray(v) ? (v[0] ?? null) : v;

  return (
    (data ?? [])
      .map((row) => {
        const r = row as unknown as {
          id: string;
          doc_type_id: string | null;
          template_id: string | null;
          is_mandatory: boolean;
          edospmis_supplier_doc_types: DocJoin | DocJoin[] | null;
          edospmis_procurement_templates: TplJoin | TplJoin[] | null;
        };
        const doc = one(r.edospmis_supplier_doc_types);
        const tpl = one(r.edospmis_procurement_templates);
        return {
          requirement_id: r.id,
          kind: r.doc_type_id ? ("document" as const) : ("template" as const),
          doc_type_id: r.doc_type_id,
          template_id: r.template_id,
          name: doc?.name ?? tpl?.name ?? "—",
          description: doc?.description ?? tpl?.description ?? null,
          is_mandatory: r.is_mandatory,
          template_kind: tpl?.kind ?? null,
          template_fields: tpl?.fields ?? null,
          template_instructions: tpl?.instructions ?? null,
          template_filename: tpl?.filename ?? null,
          sortHint: doc?.sort_order ?? 1000,
        };
      })
      // Mandatory first, then the order an administrator put the document types
      // in, then alphabetically — so the list reads the way the tender was set
      // up rather than the way Postgres happened to return it.
      .sort(
        (a, b) =>
          Number(b.is_mandatory) - Number(a.is_mandatory) ||
          a.sortHint - b.sortHint ||
          a.name.localeCompare(b.name),
      )
      .map((r): RfqRequirement => ({
        requirement_id: r.requirement_id,
        kind: r.kind,
        doc_type_id: r.doc_type_id,
        template_id: r.template_id,
        name: r.name,
        description: r.description,
        is_mandatory: r.is_mandatory,
        template_kind: r.template_kind,
        template_fields: r.template_fields,
        template_instructions: r.template_instructions,
        template_filename: r.template_filename,
      }))
  );
}

// ── Whether a bidder is complete ──────────────────────────────────────

/**
 * What this bidder still owes.
 *
 * The same function the award gate calls, so the evaluation table and the
 * gate can never disagree — which matters, because the one that matters is
 * the gate.
 */
export async function bidOutstanding(
  rfqId: string,
  supplierId: string,
): Promise<OutstandingRequirement[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("edospmis_bid_outstanding", {
    p_rfq_id: rfqId,
    p_supplier_id: supplierId,
  });
  return (data ?? []) as OutstandingRequirement[];
}

export interface BidSummary {
  submission_id: string;
  supplier_id: string;
  version: number;
  signed_name: string | null;
  signed_position: string | null;
  signed_at: string | null;
  content_hash: string | null;
  document_count: number;
}

/** The submitted packs for one RFQ, newest version per supplier. */
export async function listBidSubmissions(
  tenantId: string,
  rfqId: string,
): Promise<BidSummary[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("edospmis_bid_submissions")
    .select(
      "id, supplier_id, version, signed_name, signed_position, signed_at, content_hash, edospmis_bid_documents(id)",
    )
    .eq("tenant_id", tenantId)
    .eq("rfq_id", rfqId)
    .eq("status", "submitted")
    .order("version", { ascending: false });

  const seen = new Set<string>();
  const out: BidSummary[] = [];
  for (const row of data ?? []) {
    const r = row as unknown as {
      id: string;
      supplier_id: string;
      version: number;
      signed_name: string | null;
      signed_position: string | null;
      signed_at: string | null;
      content_hash: string | null;
      edospmis_bid_documents: { id: string }[] | null;
    };
    // Ordered newest first, so the first one seen per supplier is current.
    if (seen.has(r.supplier_id)) continue;
    seen.add(r.supplier_id);
    out.push({
      submission_id: r.id,
      supplier_id: r.supplier_id,
      version: r.version,
      signed_name: r.signed_name,
      signed_position: r.signed_position,
      signed_at: r.signed_at,
      content_hash: r.content_hash,
      document_count: (r.edospmis_bid_documents ?? []).length,
    });
  }
  return out;
}

/** A short-lived link to one bid document, for an evaluator. */
export async function signedBidDocumentUrl(
  tenantId: string,
  documentId: string,
): Promise<string | null> {
  const supabase = await createClient();
  const { data: row } = await supabase
    .from("edospmis_bid_documents")
    .select("storage_path")
    .eq("id", documentId)
    .eq("tenant_id", tenantId)
    .maybeSingle<{ storage_path: string }>();
  if (!row) return null;
  const { data } = await supabase.storage
    .from(BID_BUCKET)
    .createSignedUrl(row.storage_path, 600);
  return data?.signedUrl ?? null;
}

// ── The bidder's side ─────────────────────────────────────────────────

/**
 * The pack as the bidder sees it, matched on their invitation token.
 *
 * Admin client, because the token functions are granted to `service_role`
 * alone: the bidder has no identity, so the token *is* the authorisation and
 * the function checks it on every call.
 */
export async function bidPackByToken(token: string): Promise<BidPack | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("edospmis_bid_pack_by_token", {
    p_token: token,
  });
  if (error || !data) return null;
  return data as BidPack;
}
