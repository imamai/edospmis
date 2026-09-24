"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/data/session";
import { createClient } from "@/lib/supabase/server";

export interface ProcurementState {
  error: string | null;
  ok: string | null;
}

export async function startProcurement(caseId: string): Promise<ProcurementState> {
  await requireSession();
  const supabase = await createClient();
  const { error } = await supabase.rpc("edospmis_start_procurement", { p_case_id: caseId });
  if (error) return { error: error.message, ok: null };
  revalidatePath(`/app/cases/${caseId}`);
  return { error: null, ok: "Procurement started." };
}

export async function inviteSupplierToRfq(rfqId: string, caseId: string, supplierId: string): Promise<ProcurementState> {
  const session = await requireSession();
  if (!supplierId) return { error: "Choose a supplier.", ok: null };
  const supabase = await createClient();
  const { error } = await supabase
    .from("edospmis_rfq_suppliers")
    .insert({ tenant_id: session.tenant.id, rfq_id: rfqId, supplier_id: supplierId });
  if (error) return { error: error.code === "23505" ? "Already invited." : "Couldn't invite that supplier.", ok: null };
  revalidatePath(`/app/cases/${caseId}`);
  return { error: null, ok: "Supplier invited." };
}

export async function recordQuotation(_prev: ProcurementState, form: FormData): Promise<ProcurementState> {
  const session = await requireSession();
  const rfqId = String(form.get("rfq_id") ?? "");
  const caseId = String(form.get("case_id") ?? "");
  const supplierId = String(form.get("supplier_id") ?? "");
  const totalRaw = String(form.get("total") ?? "");
  const notes = String(form.get("notes") ?? "").trim() || null;
  if (!supplierId) return { error: "Choose a supplier.", ok: null };
  const totalCents = Math.round(Number(totalRaw) * 100);
  if (!Number.isFinite(totalCents) || totalCents <= 0) return { error: "Enter the quoted amount.", ok: null };

  const supabase = await createClient();
  const { error } = await supabase.from("edospmis_quotations").insert({
    tenant_id: session.tenant.id,
    rfq_id: rfqId,
    supplier_id: supplierId,
    total_cents: totalCents,
    notes,
  });
  if (error) return { error: "Couldn't save that quotation.", ok: null };

  revalidatePath(`/app/cases/${caseId}`);
  return { error: null, ok: "Quotation recorded." };
}

export async function awardPO(rfqId: string, caseId: string, quotationId: string, notes: string): Promise<ProcurementState> {
  await requireSession();
  const supabase = await createClient();
  const { error } = await supabase.rpc("edospmis_award_po", {
    p_rfq_id: rfqId,
    p_quotation_id: quotationId,
    p_notes: notes || null,
  });
  if (error) return { error: error.message, ok: null };
  revalidatePath(`/app/cases/${caseId}`);
  return { error: null, ok: "Purchase order issued." };
}
