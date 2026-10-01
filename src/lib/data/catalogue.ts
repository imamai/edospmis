import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * The item catalogue — what this business buys, named once.
 *
 * Reads go through the caller's own client so row-level security decides what
 * they see, exactly as everywhere else in this app. Nothing here uses the
 * service role.
 */

export interface CatalogueItem {
  id: string;
  code: string | null;
  description: string;
  unit: string;
  indicative_unit_cost_cents: number | null;
  currency: string;
  category_id: string | null;
  source: "manual" | "import";
  notes: string | null;
  is_active: boolean;
}

const COLUMNS =
  "id, code, description, unit, indicative_unit_cost_cents, currency, category_id, source, notes, is_active";

/**
 * The catalogue for a settings screen: everything, active first.
 *
 * Inactive rows are kept and shown rather than deleted, because a request
 * raised last year still points at one and a disappearing row would make that
 * history unreadable.
 */
export async function listCatalogue(
  tenantId: string,
): Promise<CatalogueItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("edospmis_catalogue_items")
    .select(COLUMNS)
    .eq("tenant_id", tenantId)
    .order("is_active", { ascending: false })
    .order("description");
  return (data ?? []) as CatalogueItem[];
}

/**
 * The picker's search.
 *
 * Active rows only — a requester should not be able to pick something the
 * business has stopped buying. Capped, because a picker is for choosing from
 * a handful, and a thousand results is a scroll, not an answer.
 */
export async function searchCatalogue(
  tenantId: string,
  term: string,
  limit = 30,
): Promise<CatalogueItem[]> {
  const supabase = await createClient();
  const query = supabase
    .from("edospmis_catalogue_items")
    .select(COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("description")
    .limit(limit);

  const trimmed = term.trim();
  if (trimmed) {
    // Escape the wildcards, so a code containing % or _ searches for itself
    // rather than matching everything.
    const safe = trimmed.replace(/[%_\\]/g, (c) => `\\${c}`);
    query.or(`description.ilike.%${safe}%,code.ilike.%${safe}%`);
  }

  const { data } = await query;
  return (data ?? []) as CatalogueItem[];
}

export interface ImportRow {
  code: string | null;
  description: string;
  unit: string | null;
  indicative_unit_cost_cents: number | null;
  notes: string | null;
}

export interface ImportResult {
  inserted: number;
  updated: number;
}

/**
 * Applies a parsed spreadsheet in one transaction.
 *
 * The permission check lives in the function itself as well as in the table's
 * policy — see migration 0048. Belt and braces on purpose: this is the one
 * path that can rewrite several thousand rows at once.
 */
export async function importCatalogue(
  tenantId: string,
  rows: ImportRow[],
): Promise<ImportResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("edospmis_import_catalogue", {
    p_tenant_id: tenantId,
    p_rows: rows,
  });
  if (error) throw new Error(error.message);

  // The function returns a single row of counts.
  const result = Array.isArray(data) ? data[0] : data;
  return {
    inserted: Number((result as ImportResult | undefined)?.inserted ?? 0),
    updated: Number((result as ImportResult | undefined)?.updated ?? 0),
  };
}
