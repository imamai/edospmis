"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/data/session";
import { createClient } from "@/lib/supabase/server";

export interface FinanceState {
  error: string | null;
  ok: string | null;
}

function parseInvoiceItems(form: FormData) {
  const descriptions = form.getAll("item_description") as string[];
  const units = form.getAll("item_unit") as string[];
  const qtys = form.getAll("item_qty") as string[];
  const costs = form.getAll("item_unit_cost") as string[];
  const items = [];
  for (let i = 0; i < descriptions.length; i++) {
    const description = (descriptions[i] ?? "").trim();
    const qty = Number(qtys[i] ?? 0);
    if (!description || !Number.isFinite(qty) || qty <= 0) continue;
    items.push({
      description,
      unit: (units[i] ?? "").trim() || "unit",
      qty,
      unit_cost_cents: Math.round(Math.max(0, Number(costs[i] ?? 0)) * 100),
    });
  }
  return items;
}

export async function submitInvoice(_prev: FinanceState, form: FormData): Promise<FinanceState> {
  await requireSession();
  const caseId = String(form.get("case_id") ?? "");
  const invoiceNumber = String(form.get("invoice_number") ?? "").trim();
  const paymentTerms = String(form.get("payment_terms") ?? "").trim() || null;
  const dueDate = String(form.get("due_date") ?? "") || null;
  const taxCents = Math.round(Math.max(0, Number(form.get("tax") ?? 0)) * 100);
  const items = parseInvoiceItems(form);
  if (!invoiceNumber) return { error: "Enter the supplier's invoice number.", ok: null };
  if (items.length === 0) return { error: "Add at least one line item.", ok: null };

  const supabase = await createClient();
  const { error } = await supabase.rpc("edospmis_submit_invoice", {
    p_case_id: caseId,
    p_invoice_number: invoiceNumber,
    p_items: items,
    p_tax_cents: taxCents,
    p_payment_terms: paymentTerms,
    p_due_date: dueDate,
  });
  if (error) return { error: error.message, ok: null };
  revalidatePath(`/app/cases/${caseId}`);
  return { error: null, ok: "Invoice submitted and matched." };
}

export async function resolveMatchException(_prev: FinanceState, form: FormData): Promise<FinanceState> {
  await requireSession();
  const exceptionId = String(form.get("exception_id") ?? "");
  const caseId = String(form.get("case_id") ?? "");
  const note = String(form.get("resolution_note") ?? "").trim();
  if (!note) return { error: "Explain how this was resolved.", ok: null };

  const supabase = await createClient();
  const { error } = await supabase.rpc("edospmis_resolve_match_exception", {
    p_exception_id: exceptionId,
    p_resolution_note: note,
  });
  if (error) return { error: error.message, ok: null };
  revalidatePath(`/app/cases/${caseId}`);
  return { error: null, ok: "Exception resolved." };
}

export async function approveInvoice(invoiceId: string, caseId: string): Promise<FinanceState> {
  await requireSession();
  const supabase = await createClient();
  const { error } = await supabase.rpc("edospmis_approve_invoice", { p_invoice_id: invoiceId });
  if (error) return { error: error.message, ok: null };
  revalidatePath(`/app/cases/${caseId}`);
  return { error: null, ok: "Invoice approved for payment." };
}

export async function recordInvoicePayment(_prev: FinanceState, form: FormData): Promise<FinanceState> {
  await requireSession();
  const invoiceId = String(form.get("invoice_id") ?? "");
  const caseId = String(form.get("case_id") ?? "");
  const reference = String(form.get("reference") ?? "").trim() || null;
  const paymentMethod = String(form.get("payment_method") ?? "").trim() || null;

  const supabase = await createClient();
  const { error } = await supabase.rpc("edospmis_record_payment", {
    p_invoice_id: invoiceId,
    p_reference: reference,
    p_payment_method: paymentMethod,
  });
  if (error) return { error: error.message, ok: null };
  revalidatePath(`/app/cases/${caseId}`);
  return { error: null, ok: "Payment recorded." };
}

/**
 * The "pay several invoices in one sitting" batch action for the Invoices &
 * payments report — a deliberate, narrow exception to reports staying
 * read-only (see the write-up shared with the user before this shipped):
 * it calls the exact same edospmis_record_payment RPC as the single-invoice
 * flow above, once per selected invoice, so there is still exactly one
 * place that decides whether a payment can be recorded and one audit-log
 * shape for it — this just lets a Finance user fire it at several invoices
 * without opening each case individually.
 */
export interface BulkPaymentResult {
  paid: number;
  /** One message per invoice that was refused, de-duplicated by the caller for display. */
  failures: string[];
}

export async function bulkRecordPayments(invoiceIds: string[], reference: string, paymentMethod: string): Promise<BulkPaymentResult> {
  await requireSession();
  if (invoiceIds.length === 0) return { paid: 0, failures: ["Select at least one invoice."] };

  const supabase = await createClient();
  const failures: string[] = [];
  let paid = 0;
  // Every invoice is attempted, and the outcome of each is reported back.
  // This used to return on the first refusal, which left the earlier
  // invoices paid, the later ones untouched and the person reading
  // "stopped after a problem on one invoice" with no way to tell which of
  // their ten had gone through. Each call is its own transaction inside the
  // RPC, so there is nothing to roll back — only something to report.
  for (const invoiceId of invoiceIds) {
    const { error } = await supabase.rpc("edospmis_record_payment", {
      p_invoice_id: invoiceId,
      p_reference: reference.trim() || null,
      p_payment_method: paymentMethod.trim() || null,
    });
    if (error) failures.push(error.message);
    else paid++;
  }
  revalidatePath("/app/reports/invoices");
  return { paid, failures };
}

export async function setSodSettings(_prev: FinanceState, form: FormData): Promise<FinanceState> {
  const session = await requireSession();
  const prRule = form.get("pr_requester_not_approver") === "on";
  const receiverRule = form.get("receiver_not_payment_approver") === "on";

  const supabase = await createClient();
  const { error } = await supabase.rpc("edospmis_set_sod_settings", {
    p_tenant_id: session.tenant.id,
    p_pr_requester_not_approver: prRule,
    p_receiver_not_payment_approver: receiverRule,
  });
  if (error) return { error: error.message, ok: null };
  revalidatePath("/app/settings/segregation-of-duties");
  return { error: null, ok: "Settings saved." };
}

export async function setMatchTolerances(_prev: FinanceState, form: FormData): Promise<FinanceState> {
  const session = await requireSession();
  const pct = Number(form.get("price_pct") ?? 0);
  const flat = Math.round(Math.max(0, Number(form.get("price_amount") ?? 0)) * 100);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
    return { error: "A percentage tolerance has to be between 0 and 100.", ok: null };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("edospmis_set_match_tolerances", {
    p_tenant_id: session.tenant.id,
    p_price_pct: pct,
    p_price_cents: flat,
  });
  if (error) return { error: error.message, ok: null };
  revalidatePath("/app/settings/segregation-of-duties");
  return { error: null, ok: "Tolerance saved." };
}

export async function createDelegation(_prev: FinanceState, form: FormData): Promise<FinanceState> {
  await requireSession();
  const roleId = String(form.get("role_id") ?? "");
  const toUserId = String(form.get("to_user_id") ?? "");
  const startsAt = String(form.get("starts_at") ?? "");
  const endsAt = String(form.get("ends_at") ?? "");
  if (!roleId || !toUserId) return { error: "Choose a role and a teammate.", ok: null };
  if (!startsAt || !endsAt) return { error: "Choose a start and end date.", ok: null };

  const supabase = await createClient();
  const { error } = await supabase.rpc("edospmis_create_delegation", {
    p_role_id: roleId,
    p_to_user_id: toUserId,
    p_starts_at: new Date(startsAt).toISOString(),
    p_ends_at: new Date(endsAt).toISOString(),
  });
  if (error) return { error: error.message, ok: null };
  revalidatePath("/app/settings/delegations");
  return { error: null, ok: "Delegation created." };
}

export async function revokeDelegation(delegationId: string): Promise<FinanceState> {
  await requireSession();
  const supabase = await createClient();
  const { error } = await supabase.rpc("edospmis_revoke_delegation", { p_delegation_id: delegationId });
  if (error) return { error: error.message, ok: null };
  revalidatePath("/app/settings/delegations");
  return { error: null, ok: "Delegation revoked." };
}

/**
 * Correcting an invoice that has been entered wrongly.
 *
 * The match is re-run from scratch by the database, so a corrected invoice is
 * judged by the same rule as a fresh one and any finding raised against the
 * old figures is cleared. Refused once the invoice has been approved or paid
 * — at that point it is a commitment somebody signed for, and the remedy is
 * to void it and enter the right one so both stay on the record.
 */
export async function updateInvoice(_prev: FinanceState, form: FormData): Promise<FinanceState> {
  await requireSession();
  const invoiceId = String(form.get("invoice_id") ?? "");
  const caseId = String(form.get("case_id") ?? "");
  const invoiceNumber = String(form.get("invoice_number") ?? "").trim();
  const paymentTerms = String(form.get("payment_terms") ?? "").trim() || null;
  const dueDate = String(form.get("due_date") ?? "") || null;
  const taxCents = Math.round(Math.max(0, Number(form.get("tax") ?? 0)) * 100);
  const items = parseInvoiceItems(form);
  if (!invoiceId) return { error: "Couldn't tell which invoice that was.", ok: null };
  if (!invoiceNumber) return { error: "Enter the supplier's invoice number.", ok: null };
  if (items.length === 0) return { error: "Add at least one line item.", ok: null };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("edospmis_update_invoice", {
    p_invoice_id: invoiceId,
    p_invoice_number: invoiceNumber,
    p_items: items,
    p_tax_cents: taxCents,
    p_payment_terms: paymentTerms,
    p_due_date: dueDate,
  });
  if (error) return { error: error.message, ok: null };

  revalidatePath(`/app/cases/${caseId}`);
  return {
    error: null,
    ok:
      data === "exception"
        ? "Invoice corrected. The match still finds a discrepancy — see below."
        : "Invoice corrected, and it now matches the order and the receipt.",
  };
}

/**
 * Taking an invoice back.
 *
 * Not a delete. The row stays with its number, its figures and the reason,
 * which is what keeps the same supplier invoice from being entered a second
 * time by somebody who did not know about the first. Voided invoices are
 * already excluded from every cumulative total the match computes.
 */
export async function voidInvoice(_prev: FinanceState, form: FormData): Promise<FinanceState> {
  await requireSession();
  const invoiceId = String(form.get("invoice_id") ?? "");
  const caseId = String(form.get("case_id") ?? "");
  const reason = String(form.get("reason") ?? "").trim();
  if (!invoiceId) return { error: "Couldn't tell which invoice that was.", ok: null };
  if (!reason) return { error: "Say why this invoice is being voided.", ok: null };

  const supabase = await createClient();
  const { error } = await supabase.rpc("edospmis_void_invoice", {
    p_invoice_id: invoiceId,
    p_reason: reason,
  });
  if (error) return { error: error.message, ok: null };

  revalidatePath(`/app/cases/${caseId}`);
  return { error: null, ok: "Invoice voided." };
}
