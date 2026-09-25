"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/data/session";
import { createClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/notify/email";

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

/** Sources a supplier who isn't in the system yet — same invite mechanism, no supplier_id required until they submit. */
export async function inviteProspectToRfq(
  rfqId: string,
  caseId: string,
  name: string,
  email: string,
  phone: string,
): Promise<ProcurementState> {
  const session = await requireSession();
  if (!name.trim()) return { error: "Enter a company or contact name.", ok: null };
  const supabase = await createClient();
  const { error } = await supabase.from("edospmis_rfq_suppliers").insert({
    tenant_id: session.tenant.id,
    rfq_id: rfqId,
    invite_name: name.trim(),
    invite_email: email.trim() || null,
    invite_phone: phone.trim() || null,
  });
  if (error) return { error: "Couldn't add that supplier.", ok: null };
  revalidatePath(`/app/cases/${caseId}`);
  return { error: null, ok: "Supplier invited." };
}

export async function shareRfqInviteLink(caseId: string, inviteId: string): Promise<ProcurementState> {
  const session = await requireSession();
  const supabase = await createClient();
  const { data: invite } = await supabase
    .from("edospmis_rfq_suppliers")
    .select("access_token, invite_email, invite_name, supplier_id, rfq_id, edospmis_rfqs(title), edospmis_suppliers(name, email)")
    .eq("id", inviteId)
    .maybeSingle();
  if (!invite) return { error: "Couldn't find that invitation.", ok: null };

  const rfq = invite.edospmis_rfqs as unknown as { title: string } | null;
  const supplier = invite.edospmis_suppliers as unknown as { name: string; email: string | null } | null;
  const email = invite.invite_email || supplier?.email;
  if (!email) return { error: "This supplier has no email address on file.", ok: null };

  const link = `${process.env.NEXT_PUBLIC_SITE_URL}/quote/${invite.access_token}`;
  const result = await sendEmail({
    to: email,
    subject: `Request for quotation: ${rfq?.title ?? "New RFQ"} — ${session.tenant.name}`,
    html: `<p>${session.tenant.name} would like a quotation for <strong>${rfq?.title ?? "a request"}</strong>.</p><p><a href="${link}">Review the items and submit your quote here</a></p><p>This link is unique to you and expires in 30 days.</p>`,
  });
  if (!result.ok) return { error: result.error ?? "Couldn't send the email.", ok: null };

  revalidatePath(`/app/cases/${caseId}`);
  return { error: null, ok: `Emailed to ${email}.` };
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

export async function awardPO(
  rfqId: string,
  caseId: string,
  quotationId: string,
  notes: string,
  expectedDeliveryDate: string | null,
): Promise<ProcurementState> {
  await requireSession();
  const supabase = await createClient();
  const { error } = await supabase.rpc("edospmis_award_po", {
    p_rfq_id: rfqId,
    p_quotation_id: quotationId,
    p_notes: notes || null,
    p_expected_delivery_date: expectedDeliveryDate || null,
  });
  if (error) return { error: error.message, ok: null };
  revalidatePath(`/app/cases/${caseId}`);
  return { error: null, ok: "Purchase order issued." };
}

export async function approvePO(poId: string, caseId: string): Promise<ProcurementState> {
  await requireSession();
  const supabase = await createClient();
  const { error } = await supabase.rpc("edospmis_approve_po", { p_po_id: poId });
  if (error) return { error: error.message, ok: null };
  revalidatePath(`/app/cases/${caseId}`);
  return { error: null, ok: "Purchase order approved." };
}
