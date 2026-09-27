import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Invoice, MatchException, SodSettings } from "@/lib/database.types";

export type InvoiceWithExceptions = Invoice & { exceptions: MatchException[] };

export interface FinanceDetail {
  /**
   * Oldest first. An order can be billed in parts — a supplier delivering in
   * two drops bills for each — so this is a list, not one invoice.
   */
  invoices: InvoiceWithExceptions[];
  /** Net of tax and of anything voided, so it compares with the order's own value. */
  invoicedNetCents: number;
}

export async function getFinanceDetail(tenantId: string, caseId: string): Promise<FinanceDetail> {
  const supabase = await createClient();
  const { data: invoices } = await supabase
    .from("edospmis_invoices")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("case_id", caseId)
    .order("submitted_at");

  if (!invoices || invoices.length === 0) return { invoices: [], invoicedNetCents: 0 };

  const { data: exceptions } = await supabase
    .from("edospmis_match_exceptions")
    .select("*")
    .in("invoice_id", invoices.map((i) => i.id))
    .order("created_at");

  const byInvoice = new Map<string, MatchException[]>();
  for (const e of (exceptions ?? []) as MatchException[]) {
    const list = byInvoice.get(e.invoice_id) ?? [];
    list.push(e);
    byInvoice.set(e.invoice_id, list);
  }

  return {
    invoices: (invoices as Invoice[]).map((i) => ({ ...i, exceptions: byInvoice.get(i.id) ?? [] })),
    invoicedNetCents: (invoices as Invoice[])
      .filter((i) => i.status !== "void")
      .reduce((sum, i) => sum + i.subtotal_cents, 0),
  };
}

export interface MatchTolerances {
  tenant_id: string;
  price_pct: number;
  price_cents: number;
}

/** Off (zero and zero) unless a tenant has set one — see migration 0040. */
export async function getMatchTolerances(tenantId: string): Promise<MatchTolerances> {
  const supabase = await createClient();
  const { data } = await supabase.from("edospmis_match_tolerances").select("*").eq("tenant_id", tenantId).maybeSingle();
  return (data as MatchTolerances | null) ?? { tenant_id: tenantId, price_pct: 0, price_cents: 0 };
}

export async function getSodSettings(tenantId: string): Promise<SodSettings> {
  const supabase = await createClient();
  const { data } = await supabase.from("edospmis_sod_settings").select("*").eq("tenant_id", tenantId).maybeSingle();
  return (
    (data as SodSettings | null) ?? {
      tenant_id: tenantId,
      pr_requester_not_approver: false,
      receiver_not_payment_approver: false,
    }
  );
}
