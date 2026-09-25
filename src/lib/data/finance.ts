import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Invoice, MatchException, SodSettings } from "@/lib/database.types";

export interface FinanceDetail {
  invoice: (Invoice & { exceptions: MatchException[] }) | null;
}

export async function getFinanceDetail(tenantId: string, caseId: string): Promise<FinanceDetail> {
  const supabase = await createClient();
  const { data: invoice } = await supabase
    .from("edospmis_invoices")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("case_id", caseId)
    .maybeSingle();

  if (!invoice) return { invoice: null };

  const { data: exceptions } = await supabase
    .from("edospmis_match_exceptions")
    .select("*")
    .eq("invoice_id", invoice.id)
    .order("created_at");

  return { invoice: { ...(invoice as Invoice), exceptions: (exceptions ?? []) as MatchException[] } };
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
