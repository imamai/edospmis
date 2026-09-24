"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface SignInState {
  error: string | null;
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40);
  return `${base || "workspace"}-${Math.random().toString(36).slice(2, 6)}`;
}

export async function signIn(_prev: SignInState, form: FormData): Promise<SignInState> {
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "That email and password don't match." };

  // First sign-in after an email-confirmation gate: signUp() couldn't
  // provision a workspace without a session, so it stashed the tenant name
  // the person typed in their auth metadata (see /signup/actions.ts). Do it
  // now, the first moment there actually is a session to run it under.
  const { count } = await supabase
    .from("edospmis_memberships")
    .select("id", { count: "exact", head: true })
    .eq("user_id", data.user.id)
    .eq("status", "active");

  if (!count) {
    const pendingName = data.user.user_metadata?.pending_tenant_name as string | undefined;
    if (pendingName) {
      await supabase.rpc("edospmis_provision_tenant", {
        p_tenant_name: pendingName,
        p_tenant_slug: slugify(pendingName),
      });
    }
  }

  redirect("/app");
}
