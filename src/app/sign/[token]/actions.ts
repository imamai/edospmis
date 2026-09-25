"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

export interface SignFormState {
  error: string | null;
}

export async function submitSignature(token: string, _prev: SignFormState, form: FormData): Promise<SignFormState> {
  const signedName = String(form.get("signed_name") ?? "").trim();
  const signedTitle = String(form.get("signed_title") ?? "").trim();
  const consented = form.get("consented") === "on";
  if (!signedName) return { error: "Enter your full name." };
  if (!consented) return { error: "Confirm you agree to sign this electronically." };

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? "";
  const userAgent = h.get("user-agent") ?? "";

  const supabase = createAdminClient();
  const { error } = await supabase.rpc("edospmis_submit_external_signature", {
    p_token: token,
    p_signed_name: signedName,
    p_signed_title: signedTitle || null,
    p_consented: consented,
    p_ip: ip || null,
    p_user_agent: userAgent || null,
  });
  if (error) return { error: error.message };

  revalidatePath(`/sign/${token}`);
  return { error: null };
}

export async function declineSignature(token: string, _prev: SignFormState, form: FormData): Promise<SignFormState> {
  const reason = String(form.get("reason") ?? "").trim();
  const supabase = createAdminClient();
  const { error } = await supabase.rpc("edospmis_decline_external_signature", { p_token: token, p_reason: reason || null });
  if (error) return { error: error.message };

  revalidatePath(`/sign/${token}`);
  return { error: null };
}
