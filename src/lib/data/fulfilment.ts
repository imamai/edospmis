import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Delivery, Grn, GrnItem, Inspection } from "@/lib/database.types";

export interface FulfilmentDetail {
  grns: (Grn & { items: GrnItem[]; inspection: Inspection | null })[];
  delivery: Delivery | null;
}

export async function getFulfilmentDetail(tenantId: string, caseId: string): Promise<FulfilmentDetail> {
  const supabase = await createClient();
  const [{ data: grns }, { data: delivery }] = await Promise.all([
    supabase.from("edospmis_grns").select("*").eq("tenant_id", tenantId).eq("case_id", caseId).order("received_at"),
    supabase.from("edospmis_deliveries").select("*").eq("tenant_id", tenantId).eq("case_id", caseId).maybeSingle(),
  ]);

  if (!grns || grns.length === 0) {
    return { grns: [], delivery: (delivery as Delivery | null) ?? null };
  }

  const grnIds = grns.map((g) => g.id);
  const [{ data: items }, { data: inspections }] = await Promise.all([
    supabase.from("edospmis_grn_items").select("*").in("grn_id", grnIds),
    supabase.from("edospmis_inspections").select("*").in("grn_id", grnIds),
  ]);
  const itemsByGrn = new Map<string, GrnItem[]>();
  // Postgres `numeric` columns come back from PostgREST as strings (to avoid
  // precision loss) — unlike the bigint money columns elsewhere in this app,
  // which round-trip as plain JSON numbers. Coerce here so GrnItem's declared
  // `number` fields are actually numbers at runtime.
  for (const item of (items ?? []) as unknown as (Omit<GrnItem, "ordered_qty" | "received_qty"> & { ordered_qty: string; received_qty: string })[]) {
    const parsed: GrnItem = { ...item, ordered_qty: Number(item.ordered_qty), received_qty: Number(item.received_qty) };
    const list = itemsByGrn.get(parsed.grn_id) ?? [];
    list.push(parsed);
    itemsByGrn.set(parsed.grn_id, list);
  }
  const inspectionByGrn = new Map<string, Inspection>((inspections ?? []).map((i) => [i.grn_id, i as Inspection]));

  return {
    grns: (grns as Grn[]).map((g) => ({
      ...g,
      items: itemsByGrn.get(g.id) ?? [],
      inspection: inspectionByGrn.get(g.id) ?? null,
    })),
    delivery: (delivery as Delivery | null) ?? null,
  };
}
