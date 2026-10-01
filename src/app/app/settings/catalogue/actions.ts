"use server";

import { revalidatePath } from "next/cache";
import { requireSession, can } from "@/lib/data/session";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import {
  importCatalogue,
  searchCatalogue,
  type CatalogueItem,
  type ImportRow,
} from "@/lib/data/catalogue";

export interface CatalogueFormState {
  error: string | null;
  ok: string | null;
}

const DENIED = "You don't have permission to maintain the item catalogue.";

export async function addCatalogueItem(
  _prev: CatalogueFormState,
  form: FormData,
): Promise<CatalogueFormState> {
  const session = await requireSession();
  if (!can(session, "procurement.catalogue.manage"))
    return { error: DENIED, ok: null };

  const description = String(form.get("description") ?? "").trim();
  if (!description) return { error: "Give the item a description.", ok: null };

  const code = String(form.get("code") ?? "").trim() || null;
  const unit = String(form.get("unit") ?? "").trim() || "pcs";
  const costRaw = String(form.get("indicative_cost") ?? "").trim();
  const cost = costRaw === "" ? null : Math.round(Number(costRaw) * 100);
  if (cost !== null && (!Number.isFinite(cost) || cost < 0)) {
    return { error: "That indicative cost isn't a number.", ok: null };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("edospmis_catalogue_items").insert({
    tenant_id: session.tenant.id,
    code,
    description,
    unit,
    indicative_unit_cost_cents: cost,
    source: "manual",
  });

  if (error) {
    // The partial unique index on (tenant_id, lower(code)).
    return {
      error:
        error.code === "23505"
          ? `There is already an item with the code ${code}.`
          : "Couldn't save that item.",
      ok: null,
    };
  }

  await logAudit({
    tenantId: session.tenant.id,
    actorId: session.user.id,
    action: "catalogue.item.created",
    entityType: "catalogue_item",
    after: { code, description, unit },
  });

  revalidatePath("/app/settings/catalogue");
  return { error: null, ok: `Added ${description}.` };
}

export async function setCatalogueItemActive(
  itemId: string,
  isActive: boolean,
): Promise<CatalogueFormState> {
  const session = await requireSession();
  if (!can(session, "procurement.catalogue.manage"))
    return { error: DENIED, ok: null };

  const supabase = await createClient();
  const { error } = await supabase
    .from("edospmis_catalogue_items")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", itemId)
    .eq("tenant_id", session.tenant.id);
  if (error) return { error: "Couldn't update that item.", ok: null };

  revalidatePath("/app/settings/catalogue");
  return {
    error: null,
    ok: isActive
      ? "Item is available again."
      : "Item withdrawn — requesters can no longer pick it.",
  };
}

/**
 * Applies a spreadsheet the browser has already parsed.
 *
 * The rows arrive as JSON rather than as a file: parsing happens on the
 * client (lib/import/spreadsheet.ts), so nothing here has to hold a workbook
 * in memory or care how big the original file was.
 *
 * The cap is a sanity bound, not a licence — a genuine catalogue of five
 * thousand lines is plausible, fifty thousand is a pasted database and would
 * make the picker useless even if it loaded.
 */
export async function importCatalogueRows(
  rows: ImportRow[],
): Promise<CatalogueFormState> {
  const session = await requireSession();
  if (!can(session, "procurement.catalogue.manage"))
    return { error: DENIED, ok: null };

  if (!Array.isArray(rows) || rows.length === 0) {
    return { error: "There were no usable rows in that file.", ok: null };
  }
  if (rows.length > 5000) {
    return {
      error: `That file has ${rows.length.toLocaleString()} rows. Import up to 5,000 at a time.`,
      ok: null,
    };
  }

  try {
    const { inserted, updated } = await importCatalogue(
      session.tenant.id,
      rows,
    );

    await logAudit({
      tenantId: session.tenant.id,
      actorId: session.user.id,
      action: "catalogue.imported",
      entityType: "catalogue_item",
      after: { inserted, updated, rows: rows.length },
    });

    revalidatePath("/app/settings/catalogue");

    // Said as two numbers because they mean different things: one is new
    // stock lines, the other is a price list refresh. Reporting a single
    // total would hide an import that updated everything and added nothing.
    const parts = [
      inserted > 0 ? `${inserted} added` : null,
      updated > 0 ? `${updated} updated` : null,
    ].filter(Boolean);
    return {
      error: null,
      ok: parts.length
        ? `Imported — ${parts.join(", ")}.`
        : "Nothing to import from that file.",
    };
  } catch (cause) {
    return {
      error:
        cause instanceof Error ? cause.message : "Couldn't import that file.",
      ok: null,
    };
  }
}

/** The picker's search, as a server action so the catalogue is never shipped whole. */
export async function findCatalogueItems(
  term: string,
): Promise<CatalogueItem[]> {
  const session = await requireSession();
  return searchCatalogue(session.tenant.id, term);
}
