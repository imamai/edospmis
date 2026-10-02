"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { notifyBySupplierToken } from "@/lib/notify/supplier-events";
import { createAdminClient } from "@/lib/supabase/admin";

export interface QuoteFormState {
  error: string | null;
}

export async function submitQuotation(
  token: string,
  _prev: QuoteFormState,
  form: FormData,
): Promise<QuoteFormState> {
  const linePricesRaw = String(form.get("line_prices") ?? "[]");
  const notes = String(form.get("notes") ?? "").trim();
  const supplierName = String(form.get("supplier_name") ?? "").trim();
  const supplierEmail = String(form.get("supplier_email") ?? "").trim();
  const supplierPhone = String(form.get("supplier_phone") ?? "").trim();

  let linePrices: unknown;
  try {
    linePrices = JSON.parse(linePricesRaw);
  } catch {
    return {
      error: "Something went wrong reading your prices — please try again.",
    };
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

  await notifyBySupplierToken(token, {
    kind: "quotation.received",
    title: "a quotation is in — compare and award",
    permission: "procurement.rfq.evaluate",
  });

  revalidatePath(`/quote/${token}`);
  return { error: null };
}

/**
 * The bidder's whole response, in one act.
 *
 * Replaces two independent submits — prices, and sign-the-pack — that between
 * them had no safe order. Prices first set the invitation to 'submitted', and
 * the page then showed only a thank-you: the documents could never be uploaded,
 * the buyer could not award, and the bidder had been thanked. Documents first
 * signed a content hash whose price section read 'no-quotation', so the
 * signature covered no price at all.
 *
 * `edospmis_submit_bid_by_token` does the lot in one transaction, in the only
 * order that works, and raises — rolling everything back — if anything
 * mandatory is missing. There is no half-submitted state left to reach.
 */
export async function submitBid(
  token: string,
  _prev: QuoteFormState,
  form: FormData,
): Promise<QuoteFormState> {
  const linePricesRaw = String(form.get("line_prices") ?? "[]");
  const notes = String(form.get("notes") ?? "").trim();
  const supplierName = String(form.get("supplier_name") ?? "").trim();
  const supplierEmail = String(form.get("supplier_email") ?? "").trim();
  const supplierPhone = String(form.get("supplier_phone") ?? "").trim();
  const signedName = String(form.get("signed_name") ?? "").trim();
  const signedPosition = String(form.get("signed_position") ?? "").trim();
  const signing = String(form.get("signing") ?? "") === "1";

  let linePrices: unknown;
  try {
    linePrices = JSON.parse(linePricesRaw);
  } catch {
    return {
      error: "Something went wrong reading your prices — please try again.",
    };
  }

  const h = await headers();
  // The first entry is the client; the rest are proxies that added themselves.
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip")?.trim() ||
    null;

  const supabase = createAdminClient();
  const { error } = await supabase.rpc("edospmis_submit_bid_by_token", {
    p_token: token,
    p_line_prices: linePrices,
    p_notes: notes || null,
    p_supplier_name: supplierName || null,
    p_supplier_email: supplierEmail || null,
    p_supplier_phone: supplierPhone || null,
    p_signed_name: signedName || null,
    p_signed_position: signedPosition || null,
    p_signed_ip: ip,
  });
  if (error) return { error: error.message };

  // One notification for one act. Two — "a quotation arrived" and "documents
  // arrived" — would be the same event reported twice.
  await notifyBySupplierToken(
    token,
    signing
      ? {
          kind: "bid.submitted",
          title:
            "a bidder has returned their quotation and documents — check them before awarding",
          permission: "procurement.rfq.evaluate",
        }
      : {
          kind: "quotation.received",
          title: "a quotation is in — compare and award",
          permission: "procurement.rfq.evaluate",
        },
  );

  revalidatePath(`/quote/${token}`);
  return { error: null };
}

export async function declineInvite(
  token: string,
  _prev: QuoteFormState,
  form: FormData,
): Promise<QuoteFormState> {
  const reason = String(form.get("reason") ?? "").trim();
  const supabase = createAdminClient();
  const { error } = await supabase.rpc("edospmis_decline_quotation_invite", {
    p_token: token,
    p_reason: reason || null,
  });
  if (error) return { error: error.message };

  revalidatePath(`/quote/${token}`);
  return { error: null };
}
