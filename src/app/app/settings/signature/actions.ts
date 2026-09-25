"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/data/session";
import { createClient } from "@/lib/supabase/server";

export interface SignatureFormState {
  error: string | null;
  ok: string | null;
}

export async function updateMySignature(dataUrl: string | null): Promise<SignatureFormState> {
  const session = await requireSession();
  const supabase = await createClient();
  const { error } = await supabase.from("edospmis_users").update({ signature_image: dataUrl }).eq("id", session.user.id);
  if (error) return { error: "Couldn't save your signature.", ok: null };

  revalidatePath("/app/settings/signature");
  return { error: null, ok: dataUrl ? "Signature saved." : "Signature removed." };
}
