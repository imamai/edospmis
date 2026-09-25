"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

export interface QuoteFormState {
  error: string | null;
}

export async function submitQuotation(token: string, _prev: QuoteFormState, form: FormData): Promise<QuoteFormState> {
  const linePricesRaw = String(form.get("line_prices") ?? "[]");
  const notes = String(form.get("notes") ?? "").trim();
  const supplierName = String(form.get("supplier_name") ?? "").trim();
  const supplierEmail = String(form.get("supplier_email") ?? "").trim();
  const supplierPhone = String(form.get("supplier_phone") ?? "").trim();

  let linePrices: unknown;
  try {
    linePrices = JSON.parse(linePricesRaw);
  } catch {
    return { error: "Something went wrong reading your prices — please try again." };
  }

  const supabase = createAdminClient();
  const { error } = await supabase.rpc("edospmis_submit_quotation_by_token", {
    p_token: token,
    p_line_prices: linePrices,
    p_notes: notes || null,
    p_supplier_name: supplierName || null,
    p_supplier_email: supplierEmail || null,
    p_supplier_phone: supplierPhone || null,
  });
  if (error) return { error: error.message };

  revalidatePath(`/quote/${token}`);
  return { error: null };
}

export async function declineInvite(token: string, _prev: QuoteFormState, form: FormData): Promise<QuoteFormState> {
  const reason = String(form.get("reason") ?? "").trim();
  const supabase = createAdminClient();
  const { error } = await supabase.rpc("edospmis_decline_quotation_invite", { p_token: token, p_reason: reason || null });
  if (error) return { error: error.message };

  revalidatePath(`/quote/${token}`);
  return { error: null };
}
