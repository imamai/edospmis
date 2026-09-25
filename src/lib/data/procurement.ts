import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Evaluation, PurchaseOrder, Quotation, Rfq, RfqInvite, Supplier } from "@/lib/database.types";

export async function getSuppliers(tenantId: string, includeInactive = false): Promise<Supplier[]> {
  const supabase = await createClient();
  let query = supabase.from("edospmis_suppliers").select("*").eq("tenant_id", tenantId);
  if (!includeInactive) query = query.eq("is_active", true);
  const { data } = await query.order("name");
  return (data ?? []) as Supplier[];
}

export interface ProcurementDetail {
  rfq: Rfq;
  invites: RfqInvite[];
  invitedSupplierIds: string[];
  quotations: (Quotation & { supplier_name: string })[];
  evaluation: Evaluation | null;
  po: PurchaseOrder | null;
}

export async function getProcurementDetail(tenantId: string, caseId: string): Promise<ProcurementDetail | null> {
  const supabase = await createClient();
  const { data: rfq } = await supabase
    .from("edospmis_rfqs")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("case_id", caseId)
    .maybeSingle();
  if (!rfq) return null;

  const [{ data: invites }, { data: quotations }, { data: evaluation }, { data: po }] = await Promise.all([
    supabase.from("edospmis_rfq_suppliers").select("*").eq("rfq_id", rfq.id).order("invited_at"),
    supabase
      .from("edospmis_quotations")
      .select("*, edospmis_suppliers(name)")
      .eq("rfq_id", rfq.id)
      .order("total_cents"),
    supabase.from("edospmis_evaluations").select("*").eq("rfq_id", rfq.id).maybeSingle(),
    supabase.from("edospmis_purchase_orders").select("*").eq("case_id", caseId).maybeSingle(),
  ]);

  return {
    rfq: rfq as Rfq,
    invites: (invites ?? []) as RfqInvite[],
    invitedSupplierIds: (invites ?? []).filter((i) => i.supplier_id).map((i) => i.supplier_id as string),
    quotations: (quotations ?? []).map((q) => {
      const supplier = q.edospmis_suppliers as unknown as { name: string } | null;
      return { ...(q as unknown as Quotation), supplier_name: supplier?.name ?? "" };
    }),
    evaluation: (evaluation as Evaluation | null) ?? null,
    po: (po as PurchaseOrder | null) ?? null,
  };
}
