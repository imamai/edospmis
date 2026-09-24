"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface SignUpState {
  error: string | null;
  checkEmail?: boolean;
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

export async function signUp(_prev: SignUpState, form: FormData): Promise<SignUpState> {
  const fullName = String(form.get("full_name") ?? "").trim();
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const tenantName = String(form.get("tenant_name") ?? "").trim();

  if (!fullName || !email || !password || !tenantName) {
    return { error: "Please fill in every field." };
  }
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    // pending_tenant_name survives to first sign-in even when email
    // confirmation is required and no session exists yet here — see
    // /login/actions.ts, which provisions the workspace from it the moment
    // this person actually returns signed in.
    options: { data: { full_name: fullName, pending_tenant_name: tenantName } },
  });
  if (error) return { error: error.message };

  if (!data.session) {
    return { error: null, checkEmail: true };
  }

  const { error: provisionError } = await supabase.rpc("edospmis_provision_tenant", {
    p_tenant_name: tenantName,
    p_tenant_slug: slugify(tenantName),
  });
  if (provisionError) {
    return { error: `Account created, but the workspace couldn't be set up: ${provisionError.message}` };
  }

  redirect("/app");
}
