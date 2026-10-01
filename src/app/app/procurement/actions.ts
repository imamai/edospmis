"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireSession } from "@/lib/data/session";
import { createClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/notify/email";
import { rfqInviteEmail } from "@/lib/notify/auth-email";
import { formatDate } from "@/lib/utils";

export interface ProcurementState {
  error: string | null;
  ok: string | null;
}

export async function startProcurement(
  caseId: string,
): Promise<ProcurementState> {
  await requireSession();
  const supabase = await createClient();
  const { error } = await supabase.rpc("edospmis_start_procurement", {
    p_case_id: caseId,
  });
  if (error) return { error: error.message, ok: null };
  revalidatePath(`/app/cases/${caseId}`);
  return { error: null, ok: "Procurement started." };
}

export async function inviteSupplierToRfq(
  rfqId: string,
  caseId: string,
  supplierId: string,
): Promise<ProcurementState> {
  const session = await requireSession();
  if (!supplierId) return { error: "Choose a supplier.", ok: null };
  const supabase = await createClient();
  const { error } = await supabase.from("edospmis_rfq_suppliers").insert({
    tenant_id: session.tenant.id,
    rfq_id: rfqId,
    supplier_id: supplierId,
  });
  if (error)
    return {
      error:
        error.code === "23505"
          ? "Already invited."
          : "Couldn't invite that supplier.",
      ok: null,
    };
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
  if (!name.trim())
    return { error: "Enter a company or contact name.", ok: null };
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

/**
 * The address this request arrived on, so a link mailed to a supplier comes
 * back to the deployment that sent it.
 *
 * NEXT_PUBLIC_SITE_URL is the fallback rather than the source of truth: unset,
 * it produced "undefined/quote/..." in a real supplier's inbox, and on a
 * preview deployment it points every link at production.
 */
async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const proto =
    h.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function shareRfqInviteLink(
  caseId: string,
  inviteId: string,
): Promise<ProcurementState> {
  const session = await requireSession();
  const supabase = await createClient();
  const { data: invite } = await supabase
    .from("edospmis_rfq_suppliers")
    .select(
      "access_token, invite_email, invite_name, supplier_id, rfq_id, edospmis_rfqs(title, closing_date), edospmis_suppliers(name, email)",
    )
    .eq("id", inviteId)
    .maybeSingle();
  if (!invite) return { error: "Couldn't find that invitation.", ok: null };

  const rfq = invite.edospmis_rfqs as unknown as {
    title: string;
    closing_date: string | null;
  } | null;
  const supplier = invite.edospmis_suppliers as unknown as {
    name: string;
    email: string | null;
  } | null;
  const email = invite.invite_email || supplier?.email;
  if (!email)
    return { error: "This supplier has no email address on file.", ok: null };

  const base = await requestOrigin();
  const link = `${base}/quote/${invite.access_token}`;

  // What this tender asks for, so the supplier knows before they open the
  // link rather than after. Mandatory first — those are the ones that will
  // stop them submitting.
  const { data: reqRows } = await supabase
    .from("edospmis_rfq_requirements")
    .select(
      "is_mandatory, edospmis_supplier_doc_types(name), edospmis_procurement_templates(name)",
    )
    .eq("tenant_id", session.tenant.id)
    .eq("rfq_id", invite.rfq_id);

  const one = <T>(v: T | T[] | null | undefined): T | null =>
    Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

  const requirements = (reqRows ?? [])
    .map((row) => {
      const r = row as unknown as {
        is_mandatory: boolean;
        edospmis_supplier_doc_types:
          { name: string } | { name: string }[] | null;
        edospmis_procurement_templates:
          { name: string } | { name: string }[] | null;
      };
      return {
        name:
          one(r.edospmis_supplier_doc_types)?.name ??
          one(r.edospmis_procurement_templates)?.name ??
          null,
        mandatory: r.is_mandatory,
      };
    })
    .filter((r): r is { name: string; mandatory: boolean } => r.name !== null)
    .sort(
      (a, b) =>
        Number(b.mandatory) - Number(a.mandatory) ||
        a.name.localeCompare(b.name),
    )
    .map((r) => (r.mandatory ? r.name : `${r.name} (optional)`));

  const result = await sendEmail({
    to: email,
    ...rfqInviteEmail({
      link,
      tenantName: session.tenant.name,
      rfqTitle: rfq?.title ?? "a request",
      closingDate: rfq?.closing_date ? formatDate(rfq.closing_date) : null,
      requirements,
    }),
  });
  if (!result.ok)
    return { error: result.error ?? "Couldn't send the email.", ok: null };

  revalidatePath(`/app/cases/${caseId}`);
  return { error: null, ok: `Emailed to ${email}.` };
}

export async function recordQuotation(
  _prev: ProcurementState,
  form: FormData,
): Promise<ProcurementState> {
  const session = await requireSession();
  const rfqId = String(form.get("rfq_id") ?? "");
  const caseId = String(form.get("case_id") ?? "");
  const supplierId = String(form.get("supplier_id") ?? "");
  const totalRaw = String(form.get("total") ?? "");
  const notes = String(form.get("notes") ?? "").trim() || null;
  if (!supplierId) return { error: "Choose a supplier.", ok: null };
  const totalCents = Math.round(Number(totalRaw) * 100);
  if (!Number.isFinite(totalCents) || totalCents <= 0)
    return { error: "Enter the quoted amount.", ok: null };

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

/**
 * Issue the purchase order.
 *
 * `overrideReason` is only ever read when the winning bidder has not returned
 * something mandatory. The gate itself lives in edospmis_award_po, not here,
 * so passing a reason when nothing is missing changes nothing and cannot be
 * used to pre-arm an override.
 */
export async function awardPO(
  rfqId: string,
  caseId: string,
  quotationId: string,
  notes: string,
  expectedDeliveryDate: string | null,
  overrideReason?: string | null,
): Promise<ProcurementState> {
  await requireSession();
  const supabase = await createClient();
  const { error } = await supabase.rpc("edospmis_award_po", {
    p_rfq_id: rfqId,
    p_quotation_id: quotationId,
    p_notes: notes || null,
    p_expected_delivery_date: expectedDeliveryDate || null,
    p_override_reason: overrideReason?.trim() || null,
  });
  if (error) return { error: error.message, ok: null };
  revalidatePath(`/app/cases/${caseId}`);
  return { error: null, ok: "Purchase order issued." };
}

export async function approvePO(
  poId: string,
  caseId: string,
): Promise<ProcurementState> {
  await requireSession();
  const supabase = await createClient();
  const { error } = await supabase.rpc("edospmis_approve_po", {
    p_po_id: poId,
  });
  if (error) return { error: error.message, ok: null };
  revalidatePath(`/app/cases/${caseId}`);
  return { error: null, ok: "Purchase order approved." };
}
