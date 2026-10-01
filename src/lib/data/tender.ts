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
  /** False while the bidder is still working on it and has not signed. */
  submitted: boolean;
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
      "id, supplier_id, version, status, signed_name, signed_position, signed_at, content_hash, edospmis_bid_documents(id)",
    )
    .eq("tenant_id", tenantId)
    .eq("rfq_id", rfqId)
    // Drafts included on purpose. A bidder part-way through was invisible to
    // the buyer, which looked exactly like a bidder who had not started — so
    // "nothing has arrived" and "everything has arrived but is unsigned" read
    // the same. What a draft must not do is open: an unsubmitted bid is not a
    // bid, and reading one is not the buyers to do. Only its existence shows.
    .in("status", ["draft", "submitted"])
    .order("status", { ascending: false })
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
      status: string;
      edospmis_bid_documents: { id: string }[] | null;
    };
    // Submitted sorts before draft, and newest version first, so the first one
    // seen per supplier is the one that counts.
    if (seen.has(r.supplier_id)) continue;
    seen.add(r.supplier_id);
    out.push({
      submission_id: r.id,
      supplier_id: r.supplier_id,
      version: r.version,
      submitted: r.status === "submitted",
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

export interface BidReviewDocument {
  id: string;
  /** The requirement it answers, or null for something sent unasked. */
  requirement: string | null;
  filename: string;
  byte_size: number | null;
  note: string | null;
}

export interface BidReview {
  supplier_id: string;
  submission_id: string;
  version: number;
  /** False while the bidder is still working. Contents are withheld until true. */
  submitted: boolean;
  /** How many files are up so far, reported even for a draft. */
  document_count: number;
  signed_name: string | null;
  signed_position: string | null;
  signed_at: string | null;
  content_hash: string | null;
  documents: BidReviewDocument[];
  templates: { name: string; filename: string | null }[];
  /** Mandatory requirements this bidder has not returned. Empty means complete. */
  outstanding: string[];
}

/**
 * What each bidder actually sent back, for the evaluation.
 *
 * Without this the pack was write-only: a supplier could upload a CR12 and
 * nobody on the buying side could see it, which makes the gate feel arbitrary
 * — an award refused for a missing document nobody can confirm is missing.
 *
 * `outstanding` comes from the same function the award gate uses, so what an
 * evaluator reads here and what the gate enforces cannot drift apart.
 */
export async function getBidReview(
  tenantId: string,
  rfqId: string,
): Promise<BidReview[]> {
  const submissions = await listBidSubmissions(tenantId, rfqId);
  if (submissions.length === 0) return [];

  const supabase = await createClient();
  const ids = submissions.map((s) => s.submission_id);

  const [{ data: docs }, { data: tpls }] = await Promise.all([
    supabase
      .from("edospmis_bid_documents")
      .select(
        "id, submission_id, filename, byte_size, note, edospmis_supplier_doc_types(name)",
      )
      .in("submission_id", ids),
    supabase
      .from("edospmis_bid_template_responses")
      .select("submission_id, filename, edospmis_procurement_templates(name)")
      .in("submission_id", ids),
  ]);

  const one = <T>(v: T | T[] | null | undefined): T | null =>
    Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

  const outstanding = await Promise.all(
    submissions.map(async (s) =>
      (await bidOutstanding(rfqId, s.supplier_id)).filter(
        (o) => o.is_mandatory,
      ),
    ),
  );

  return submissions.map((s, i) => ({
    supplier_id: s.supplier_id,
    submission_id: s.submission_id,
    version: s.version,
    submitted: s.submitted,
    document_count: (docs ?? []).filter(
      (d) => (d as { submission_id: string }).submission_id === s.submission_id,
    ).length,
    signed_name: s.signed_name,
    signed_position: s.signed_position,
    signed_at: s.signed_at,
    content_hash: s.content_hash,
    // An unsubmitted pack reports its size and nothing else. A bid is not a
    // bid until it is signed, and reading one that is not yet offered is not
    // the buyer's to do — however convenient it would be.
    documents: (s.submitted ? (docs ?? []) : [])
      .filter(
        (d) =>
          (d as { submission_id: string }).submission_id === s.submission_id,
      )
      .map((d) => {
        const row = d as unknown as {
          id: string;
          filename: string;
          byte_size: number | null;
          note: string | null;
          edospmis_supplier_doc_types:
            { name: string } | { name: string }[] | null;
        };
        return {
          id: row.id,
          requirement: one(row.edospmis_supplier_doc_types)?.name ?? null,
          filename: row.filename,
          byte_size: row.byte_size,
          note: row.note,
        };
      }),
    templates: (s.submitted ? (tpls ?? []) : [])
      .filter(
        (t) =>
          (t as { submission_id: string }).submission_id === s.submission_id,
      )
      .map((t) => {
        const row = t as unknown as {
          filename: string | null;
          edospmis_procurement_templates:
            { name: string } | { name: string }[] | null;
        };
        return {
          name: one(row.edospmis_procurement_templates)?.name ?? "Form",
          filename: row.filename,
        };
      }),
    outstanding: outstanding[i].map((o) => o.label),
  }));
}
